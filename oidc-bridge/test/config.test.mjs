import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, decodeKey } from "../src/config.mjs";

test("configuration fails closed and permits HTTP only in explicit local tests", (t) => {
  const root = mkdtempSync(join(tmpdir(), "oidc-config-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = () => randomBytes(32).toString("base64url");
  const env = {
    NODE_ENV: "test",
    OIDC_ALLOW_INSECURE_LOCAL: "true",
    OIDC_ISSUER: "http://127.0.0.1:18081",
    OIDC_CLIENT_ID: "mas",
    OIDC_REDIRECT_URI: "http://127.0.0.1:18080/callback",
    OIDC_BACKEND_URL: "http://127.0.0.1:18082/api",
  };
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const values = {
    OIDC_CLIENT_SECRET: key(),
    OIDC_BRIDGE_SHARED_SECRET: key(),
    OIDC_STORAGE_KEY: key(),
    OIDC_COOKIE_KEYS: JSON.stringify([key()]),
    OIDC_DATABASE_URL: "postgresql://localhost/disposable",
    OIDC_JWKS: JSON.stringify({
      keys: [
        {
          ...privateKey.export({ format: "jwk" }),
          kid: "test",
          alg: "RS256",
          use: "sig",
        },
      ],
    }),
  };
  for (const [name, value] of Object.entries(values)) {
    const file = join(root, name);
    writeFileSync(file, value, { mode: 0o600 });
    env[`${name}_FILE`] = file;
  }
  assert.equal(loadConfig(env).issuer, env.OIDC_ISSUER);
  assert.throws(() => loadConfig({ ...env, NODE_ENV: "production" }), /Unsafe/);
  assert.throws(
    () => loadConfig({ ...env, OIDC_ALLOW_INSECURE_LOCAL: "false" }),
    /Unsafe/,
  );
  assert.throws(
    () => loadConfig({ ...env, OIDC_ISSUER: "http://example.com" }),
    /Unsafe/,
  );
  assert.throws(
    () => loadConfig({ ...env, OIDC_BACKEND_URL: "http://169.254.169.254" }),
    /Unsafe/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...env,
        OIDC_REDIRECT_URI: "https://example.com/callback?next=bad",
      }),
    /Unsafe/,
  );
  assert.throws(
    () => loadConfig({ ...env, OIDC_ISSUER: "https://user:pass@example.com" }),
    /Unsafe/,
  );
  assert.throws(
    () => loadConfig({ ...env, OIDC_JWKS_FILE: undefined }),
    /missing/,
  );
  assert.throws(() => decodeKey("weak-password", "test"));
});
