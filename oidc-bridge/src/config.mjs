import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";

export function decodeKey(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(
      `${label} must contain 32 random bytes encoded as base64url`,
    );
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value)
    throw new Error(`Invalid ${label}`);
  return key;
}

export function loadConfig(env = process.env) {
  const required = (name) => {
    if (!env[name]) throw new Error(`Missing ${name}`);
    return env[name];
  };
  const secret = (name) =>
    readFileSync(required(`${name}_FILE`), "utf8").trim();
  const jsonSecret = (name) => {
    try {
      return JSON.parse(secret(name));
    } catch {
      throw new Error(`Invalid or missing ${name} file`);
    }
  };
  const local =
    env.OIDC_ALLOW_INSECURE_LOCAL === "true" && env.NODE_ENV !== "production";
  const validateURL = (value, label, backend = false) => {
    const url = new URL(value);
    const localHosts = backend
      ? ["127.0.0.1", "localhost", "host.docker.internal"]
      : ["127.0.0.1", "localhost"];
    if (
      (url.protocol !== "https:" &&
        !(
          local &&
          url.protocol === "http:" &&
          localHosts.includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(`Unsafe ${label}`);
    return url;
  };
  const issuer = validateURL(required("OIDC_ISSUER"), "issuer");
  if (issuer.pathname !== "/")
    throw new Error("OIDC issuer must use an origin without a path");
  const redirect = validateURL(required("OIDC_REDIRECT_URI"), "redirect URI");
  const backend = validateURL(
    required("OIDC_BACKEND_URL"),
    "backend URL",
    true,
  );
  const clientSecret = secret("OIDC_CLIENT_SECRET");
  decodeKey(clientSecret, "client secret");
  const backendSecret = secret("OIDC_BRIDGE_SHARED_SECRET");
  decodeKey(backendSecret, "bridge secret");
  const storageKey = decodeKey(secret("OIDC_STORAGE_KEY"), "storage key");
  const cookieKeys = jsonSecret("OIDC_COOKIE_KEYS");
  if (!Array.isArray(cookieKeys) || cookieKeys.length === 0)
    throw new Error("Cookie keys are required");
  cookieKeys.forEach((key) => decodeKey(key, "cookie key"));
  const jwks = jsonSecret("OIDC_JWKS");
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0)
    throw new Error("Signing keys are required");
  const ids = new Set();
  for (const key of jwks.keys) {
    if (
      !key.kid ||
      ids.has(key.kid) ||
      key.kty !== "RSA" ||
      key.alg !== "RS256" ||
      key.use !== "sig" ||
      !key.d
    ) {
      throw new Error("Expected distinct private RS256 signing keys");
    }
    ids.add(key.kid);
    const privateKey = createPrivateKey({ key, format: "jwk" });
    if (privateKey.asymmetricKeyDetails.modulusLength < 2048)
      throw new Error("RSA signing key is too small");
  }
  const databaseURL = secret("OIDC_DATABASE_URL");
  try {
    if (!["postgres:", "postgresql:"].includes(new URL(databaseURL).protocol))
      throw new Error();
  } catch {
    throw new Error("Invalid PostgreSQL connection file");
  }
  const port = Number(env.OIDC_PORT ?? (issuer.port || 3000));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid OIDC_PORT");
  return {
    issuer: issuer.origin,
    redirectURI: redirect.href,
    clientID: required("OIDC_CLIENT_ID"),
    clientSecret,
    backendURL: backend.href.replace(/\/$/, ""),
    backendSecret,
    storageKey,
    cookieKeys,
    jwks,
    databaseURL,
    port,
    host: env.OIDC_BIND_HOST ?? "127.0.0.1",
    // TLS termination is supported only behind an explicitly trusted proxy.
    trustedProxy: env.OIDC_TRUSTED_PROXY_IP ?? null,
  };
}
