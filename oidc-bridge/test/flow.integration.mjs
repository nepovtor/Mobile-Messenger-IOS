import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { jwtVerify, createLocalJWKSet } from "jose";
import { migrate } from "../src/adapter.mjs";
import { createBridge } from "../src/provider.mjs";

const random = () => randomBytes(32).toString("base64url");
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Small HTTP test client. Cross-site cookie enforcement still requires browser acceptance tests.
export function browserClient() {
  const jar = new Map();
  return async (url, options = {}) => {
    const response = await fetch(url, {
      redirect: "manual",
      ...options,
      headers: {
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...options.headers,
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const i = pair.indexOf("=");
      if (/max-age=0/i.test(cookie) || !pair.slice(i + 1))
        jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return response;
  };
}

test(
  "real NestJS OTP to signed OIDC authorization code with PostgreSQL",
  { timeout: 120000 },
  async (t) => {
    assert.ok(
      process.env.OIDC_TEST_DATABASE_URL,
      "Use Scripts/test-oidc-bridge.sh",
    );
    const pool = new pg.Pool({
      connectionString: process.env.OIDC_TEST_DATABASE_URL,
    });
    t.after(() => pool.end());
    await migrate(pool);
    const secret = random();
    const child = fork("test/support/oidc-backend-smoke.ts", [], {
      cwd: fileURLToPath(new URL("../../server/", import.meta.url)),
      execArgv: ["--require", "ts-node/register"],
      env: { ...process.env, OIDC_TEST_SHARED_SECRET: secret },
      silent: true,
    });
    let diagnostics = "";
    child.stderr.on("data", (chunk) => {
      diagnostics += chunk;
    });
    child.stdout.resume();
    t.after(async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
    });
    const ready = await Promise.race([
      once(child, "message").then(([message]) => message),
      once(child, "exit").then(() => {
        throw new Error(`OTP fixture failed: ${diagnostics}`);
      }),
    ]);
    assert.equal(ready.kind, "ready");
    const issuer = `http://127.0.0.1:${await freePort()}`;
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const config = {
      issuer,
      redirectURI: "http://127.0.0.1:18080/callback",
      clientID: "mobile-messenger-mas",
      clientSecret: random(),
      backendURL: `http://127.0.0.1:${ready.port}/api`,
      backendSecret: secret,
      storageKey: randomBytes(32),
      cookieKeys: [random()],
      jwks: {
        keys: [
          {
            ...privateKey.export({ format: "jwk" }),
            kid: "test",
            use: "sig",
            alg: "RS256",
          },
        ],
      },
    };
    let app = await createBridge({ config, pool });
    app.server.listen(new URL(issuer).port, "127.0.0.1");
    await once(app.server, "listening");
    t.after(() => app.close());
    let messageID = 0;
    const otp = (phone) =>
      new Promise((resolve) => {
        const id = ++messageID;
        const handler = (message) => {
          if (message.id === id) {
            child.off("message", handler);
            resolve(message.code);
          }
        };
        child.on("message", handler);
        child.send({ kind: "otp", phone, id });
      });
    async function token(code, verifier, changes = {}) {
      return fetch(`${issuer}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${config.clientID}:${config.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.redirectURI,
          code_verifier: verifier,
          ...changes,
        }),
      });
    }
    async function authorize(phone) {
      const browser = browserClient();
      const verifier = random();
      const nonce = random();
      const state = random();
      const query = new URLSearchParams({
        client_id: config.clientID,
        redirect_uri: config.redirectURI,
        response_type: "code",
        scope: "openid profile",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        nonce,
        state,
      });
      let response = await browser(`${issuer}/auth?${query}`);
      assert.equal(response.status, 303);
      let location = new URL(response.headers.get("location"), issuer).href;
      response = await browser(location);
      let html = await response.text();
      const csrf = () => /name="csrf" value="([^"]+)"/.exec(html)?.[1];
      const post = (action, fields) =>
        browser(`${location}/${action}`, {
          method: "POST",
          headers: {
            Origin: issuer,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(fields),
        });
      assert.ok(csrf(), html);
      // Cookie binding, exact origin and CSRF are all required.
      const forbidden = await browser(`${location}/request`, {
        method: "POST",
        headers: {
          Origin: "https://attacker.test",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ csrf: csrf(), phone }),
      });
      assert.equal(forbidden.status, 403);
      assert.equal(
        (await post("request", { csrf: "wrong", phone })).status,
        403,
      );
      const firstCsrf = csrf();
      response = await post("request", { csrf: firstCsrf, phone });
      assert.equal(response.status, 200);
      html = await response.text();
      assert.ok(html.includes('name="code"'));
      assert.equal(html.includes(phone), false);
      assert.equal(
        (await post("request", { csrf: firstCsrf, phone })).status,
        403,
      );
      // Store and signed cookies must survive a process restart.
      await app.close();
      app = await createBridge({ config, pool });
      app.server.listen(new URL(issuer).port, "127.0.0.1");
      await once(app.server, "listening");
      const code = await otp(phone);
      assert.match(code, /^\d{6}$/);
      response = await post("verify", { csrf: csrf(), code });
      for (let i = 0; i < 8; i++) {
        if ([302, 303].includes(response.status)) {
          const next = new URL(response.headers.get("location"), issuer);
          if (next.origin === new URL(config.redirectURI).origin) {
            assert.equal(next.searchParams.get("state"), state);
            assert.equal(
              next.searchParams.has("error"),
              false,
              next.searchParams.get("error_description"),
            );
            return { code: next.searchParams.get("code"), verifier, nonce };
          }
          location = next.href;
          response = await browser(location);
          continue;
        }
        html = await response.text();
        assert.equal(response.status, 200, html);
        assert.ok(html.includes("/confirm"), html);
        response = await post("confirm", { csrf: csrf() });
      }
      throw new Error("OIDC redirect sequence did not complete");
    }
    await t.test(
      "discovery exposes code/S256 only and rejects proxy spoofing",
      async () => {
        const discovery = await (
          await fetch(`${issuer}/.well-known/openid-configuration`)
        ).json();
        assert.deepEqual(discovery.response_types_supported, ["code"]);
        assert.deepEqual(discovery.code_challenge_methods_supported, ["S256"]);
        assert.equal(discovery.registration_endpoint, undefined);
        assert.equal(
          (
            await fetch(`${issuer}/healthz`, {
              headers: { "X-Forwarded-For": "1.2.3.4" },
            })
          ).status,
          400,
        );
        const noPKCE = new URLSearchParams({
          client_id: config.clientID,
          redirect_uri: config.redirectURI,
          response_type: "code",
          scope: "openid",
        });
        const invalid = await fetch(`${issuer}/auth?${noPKCE}`, {
          redirect: "manual",
        });
        assert.equal(
          new URL(invalid.headers.get("location")).searchParams.get("error"),
          "invalid_request",
        );
      },
    );
    let subject;
    await t.test(
      "preserves Nest UUID, verifies signature/issuer/audience/nonce and prevents code replay",
      async () => {
        const auth = await authorize("+15552004001");
        const response = await token(auth.code, auth.verifier);
        assert.equal(response.status, 200, await response.clone().text());
        const body = await response.json();
        const jwks = await (await fetch(`${issuer}/jwks`)).json();
        const result = await jwtVerify(body.id_token, createLocalJWKSet(jwks), {
          issuer,
          audience: config.clientID,
        });
        assert.equal(result.payload.nonce, auth.nonce);
        const dbUser = (
          await pool.query("SELECT id FROM users WHERE phone=$1", [
            "+15552004001",
          ])
        ).rows[0];
        assert.equal(result.payload.sub, dbUser.id);
        subject = dbUser.id;
        const userinfo = await (
          await fetch(`${issuer}/me`, {
            headers: { Authorization: `Bearer ${body.access_token}` },
          })
        ).json();
        assert.deepEqual(userinfo, {
          sub: subject,
          preferred_username: `u_${subject.replaceAll("-", "")}`,
        });
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM auth_sessions WHERE principal_id=$1",
              [subject],
            )
          ).rows[0].n,
          0,
        );
        assert.equal((await token(auth.code, auth.verifier)).status, 400);
      },
    );
    await t.test(
      "rejects wrong PKCE verifier and an account blocked after OTP",
      async () => {
        const auth = await authorize("+15552004002");
        assert.equal((await token(auth.code, random())).status, 400);
        await pool.query("UPDATE users SET status='blocked' WHERE phone=$1", [
          "+15552004002",
        ]);
        assert.equal((await token(auth.code, auth.verifier)).status, 400);
      },
    );
    await t.test(
      "exactly one concurrent HTTP authorization-code redemption succeeds",
      async () => {
        const auth = await authorize("+15552004003");
        const responses = await Promise.all(
          Array.from({ length: 8 }, () => token(auth.code, auth.verifier)),
        );
        assert.equal(
          responses.filter((response) => response.status === 200).length,
          1,
        );
        assert.ok(
          responses.every((response) => [200, 400].includes(response.status)),
        );
      },
    );
  },
);
