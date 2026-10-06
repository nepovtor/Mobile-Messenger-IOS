import { createServer } from "node:http";
import { Provider } from "oidc-provider";
import { createAdapter, consumeRateLimit } from "./adapter.mjs";
import { interactionMiddleware, validSubject } from "./interactions.mjs";

export async function createBridge({ config, pool, backendFetch = fetch }) {
  const Adapter = createAdapter(pool, config.storageKey);
  async function backend(action, body) {
    const response = await backendFetch(
      `${config.backendURL}/auth/oidc/${action}`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/json",
          "X-OIDC-Bridge-Secret": config.backendSecret,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok)
      throw Object.assign(new Error("Identity verification failed"), {
        status: response.status,
      });
    return response.json();
  }
  const provider = new Provider(config.issuer, {
    adapter: Adapter,
    jwks: config.jwks,
    clients: [
      {
        client_id: config.clientID,
        client_secret: config.clientSecret,
        redirect_uris: [config.redirectURI],
        response_types: ["code"],
        response_modes: ["query"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "client_secret_basic",
        id_token_signed_response_alg: "RS256",
      },
    ],
    cookies: {
      keys: config.cookieKeys,
      short: { httpOnly: true, sameSite: "lax", signed: true },
      long: { httpOnly: true, sameSite: "lax", signed: true },
    },
    claims: { openid: ["sub"], profile: ["preferred_username"] },
    scopes: ["openid", "profile"],
    responseTypes: ["code"],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: true },
    },
    ttl: {
      AccessToken: 300,
      AuthorizationCode: 60,
      Grant: 3600,
      IdToken: 300,
      Interaction: 300,
      Session: 3600,
    },
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    async findAccount(_ctx, subject) {
      if (!validSubject(subject)) return undefined;
      try {
        const account = await backend("account", { subject });
        if (account.subject !== subject) return undefined;
      } catch {
        return undefined;
      }
      return {
        accountId: subject,
        claims: async () => ({
          sub: subject,
          preferred_username: `u_${subject.replaceAll("-", "")}`,
        }),
      };
    },
    renderError(ctx) {
      ctx.type = "text";
      ctx.body = "Authorization could not be completed.";
    },
  });
  // No tokens or request objects are sent to logs.
  provider.on("error", () => {});
  provider.on("server_error", () => {});
  if (config.trustedProxy) {
    provider.proxy = true;
    provider.maxIpsCount = 1;
  }
  provider.use(async (ctx, next) => {
    ctx.set("Cache-Control", "no-store");
    ctx.set(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    ctx.set("Referrer-Policy", "no-referrer");
    ctx.set("X-Content-Type-Options", "nosniff");
    try {
      const forwarded = [
        "forwarded",
        "x-forwarded-for",
        "x-forwarded-proto",
        "x-forwarded-host",
      ].some((name) => ctx.get(name));
      if (
        forwarded &&
        (!config.trustedProxy ||
          ctx.req.socket.remoteAddress !== config.trustedProxy)
      )
        ctx.throw(400);
      if (
        ctx.host !== new URL(config.issuer).host ||
        (config.issuer.startsWith("https:") && !ctx.secure)
      )
        ctx.throw(400);
      if (ctx.path === "/healthz" && ctx.method === "GET") {
        await pool.query("SELECT 1");
        ctx.body = { status: "ok" };
        return;
      }
      if (!(await consumeRateLimit(pool, config.storageKey, ctx.ip))) {
        ctx.set("Retry-After", "60");
        ctx.throw(429);
      }
      await next();
    } catch (error) {
      ctx.status = Number.isInteger(error.status) ? error.status : 500;
      ctx.type = "text";
      ctx.body = "Request could not be completed.";
    }
  });
  provider.use(interactionMiddleware(provider, config, Adapter, backend));
  const server = createServer(provider.callback());
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    provider,
    server,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
