import assert from "node:assert/strict";
import { spawn, fork } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "../src/adapter.mjs";

// All configuration, credentials and data are disposable. No production env files are loaded.
const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "mm-matrix-oidc-"));
const prefix = `mm-matrix-oidc-${process.pid}`;
const containers = [];
const image = `${prefix}:test`;
const postgresImage =
  "postgres@sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229";
const masImage =
  "ghcr.io/element-hq/matrix-authentication-service@sha256:e089f1048a1d4a9a492ed17b9fe759100f1bd619407b001f5927928d88b780c4";
const synapseImage =
  "ghcr.io/element-hq/synapse@sha256:6b84a7bbac36f080b2d2e51e0289cf1b08b349598ea44a558df38d558f2c2311";
const providerID = "01K6Y0TP000000000000000001";
const downstreamID = "01K6Y0TP000000000000000002";
const random = () => randomBytes(32).toString("base64url");
const secret = async (name, value) => {
  await writeFile(join(temporary, name), value, { mode: 0o600 });
  return `/secrets/${name}`;
};
let backend;
let pool;
let shuttingDown = false;

async function command(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: root,
      ...options,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve((out + (options.includeStderr ? err : "")).trim())
        : reject(
            new Error(
              `${bin} ${args[0]} failed (${code}): ${err.slice(-1500)}`,
            ),
          ),
    );
    child.stdin.end(options.input);
  });
}
async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function waitFor(check, label) {
  for (let i = 0; i < 120; i++) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready`);
}
async function runContainer(name, args) {
  containers.push(name);
  await command("docker", ["run", "--detach", "--name", name, ...args]);
}
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (backend && backend.exitCode === null) {
    backend.kill("SIGTERM");
    await once(backend, "exit");
  }
  if (pool) await pool.end();
  for (const container of containers.reverse())
    await command("docker", ["rm", "-f", container]).catch(() => {});
  await command("docker", ["image", "rm", image]).catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await cleanup();
    process.exit(1);
  });

try {
  const [masPort, bridgePort, synapsePort, pgPort] = await Promise.all([
    port(),
    port(),
    port(),
    port(),
  ]);
  const masURL = `http://127.0.0.1:${masPort}`;
  const issuer = `http://127.0.0.1:${bridgePort}`;
  const synapseURL = `http://127.0.0.1:${synapsePort}`;
  const callback = "http://127.0.0.1:18999/callback";
  const password = random();
  const bridgeSecret = random();
  const clientSecret = random();
  const matrixSecret = random();
  await secret(
    "postgres.env",
    `POSTGRES_PASSWORD=${password}\nPOSTGRES_INITDB_ARGS=--locale=C --encoding=UTF8\n`,
  );
  const anchor = `${prefix}-db`;
  await runContainer(anchor, [
    "--env-file",
    join(temporary, "postgres.env"),
    "--tmpfs",
    "/var/lib/postgresql/data",
    "--add-host",
    "host.docker.internal:host-gateway",
    "-p",
    `127.0.0.1:${pgPort}:5432`,
    "-p",
    `127.0.0.1:${masPort}:${masPort}`,
    "-p",
    `127.0.0.1:${bridgePort}:${bridgePort}`,
    "-p",
    `127.0.0.1:${synapsePort}:${synapsePort}`,
    postgresImage,
  ]);
  await waitFor(async () => {
    await command("docker", ["exec", anchor, "pg_isready", "-U", "postgres"]);
    return true;
  }, "PostgreSQL");
  const sql = [];
  const passwords = {};
  for (const name of ["messenger", "synapse", "mas", "oidc"]) {
    passwords[name] = random();
    sql.push(
      `CREATE ROLE ${name} LOGIN PASSWORD '${passwords[name]}'; CREATE DATABASE ${name} OWNER ${name} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'; REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC; GRANT CONNECT ON DATABASE ${name} TO ${name};`,
    );
  }
  await command(
    "docker",
    ["exec", "-i", anchor, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql.join("\n") },
  );
  const backendDatabase = `postgresql://messenger:${passwords.messenger}@127.0.0.1:${pgPort}/messenger`;
  await command("npm", ["run", "build"], { cwd: join(root, "server") });
  await command("npm", ["run", "migration:run:dist"], {
    cwd: join(root, "server"),
    env: {
      ...process.env,
      DATABASE_URL: backendDatabase,
      DB_SYNCHRONIZE: "false",
    },
  });
  backend = fork("test/support/oidc-backend-smoke.ts", [], {
    cwd: join(root, "server"),
    execArgv: ["--require", "ts-node/register"],
    silent: true,
    env: {
      ...process.env,
      OIDC_TEST_DATABASE_URL: backendDatabase,
      OIDC_TEST_SHARED_SECRET: bridgeSecret,
    },
  });
  backend.stdout.resume();
  backend.stderr.resume();
  const ready = await Promise.race([
    once(backend, "message").then(([message]) => message),
    once(backend, "exit").then(() => {
      throw new Error("Isolated backend failed");
    }),
  ]);
  assert.equal(ready.kind, "ready");
  const sharedMount = [
    "--mount",
    `type=bind,src=${temporary},dst=/secrets,readonly`,
  ];
  // Shared container networking makes the same loopback issuer reachable by MAS and the test browser.
  const sharedNetwork = ["--network", `container:${anchor}`];
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const bridgeEnv = {
    NODE_ENV: "test",
    OIDC_ALLOW_INSECURE_LOCAL: "true",
    OIDC_BIND_HOST: "0.0.0.0",
    OIDC_PORT: bridgePort,
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "mobile-messenger-mas",
    OIDC_REDIRECT_URI: `${masURL}/upstream/callback/${providerID}`,
    OIDC_BACKEND_URL: `http://host.docker.internal:${ready.port}/api`,
    OIDC_CLIENT_SECRET_FILE: await secret("client.secret", clientSecret),
    OIDC_BRIDGE_SHARED_SECRET_FILE: await secret("bridge.secret", bridgeSecret),
    OIDC_STORAGE_KEY_FILE: await secret("storage.secret", random()),
    OIDC_COOKIE_KEYS_FILE: await secret(
      "cookies.json",
      JSON.stringify([random()]),
    ),
    OIDC_JWKS_FILE: await secret(
      "jwks.json",
      JSON.stringify({
        keys: [
          {
            ...privateKey.export({ format: "jwk" }),
            kid: "disposable",
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
    ),
    OIDC_DATABASE_URL_FILE: await secret(
      "oidc.database",
      `postgresql://oidc:${passwords.oidc}@127.0.0.1:5432/oidc`,
    ),
  };
  await secret(
    "bridge.env",
    Object.entries(bridgeEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  pool = new pg.Pool({
    connectionString: `postgresql://oidc:${passwords.oidc}@127.0.0.1:${pgPort}/oidc`,
  });
  await migrate(pool);
  console.log("Building pinned OIDC bridge image for isolated Matrix stack...");
  await command("docker", ["build", "-t", image, join(root, "oidc-bridge")]);
  // Current host UID owns 0600 test secrets; the unprivileged container uses that UID.
  const user = `${process.getuid()}:${process.getgid()}`;
  await runContainer(`${prefix}-bridge`, [
    ...sharedNetwork,
    ...sharedMount,
    "--user",
    user,
    "--env-file",
    join(temporary, "bridge.env"),
    image,
  ]);
  await waitFor(
    async () => (await fetch(`${issuer}/healthz`)).ok,
    "OIDC bridge",
  );
  const masKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({ type: "pkcs8", format: "pem" });
  const masConfig = {
    http: {
      public_base: masURL,
      issuer: masURL,
      trusted_proxies: [],
      listeners: [
        {
          name: "test",
          resources: [
            { name: "discovery" },
            { name: "human" },
            { name: "oauth" },
            { name: "compat" },
            { name: "health" },
            { name: "assets" },
          ],
          binds: [{ address: `0.0.0.0:${masPort}` }],
        },
      ],
    },
    database: { uri: `postgresql://mas:${passwords.mas}@127.0.0.1:5432/mas` },
    matrix: {
      homeserver: "localhost",
      endpoint: synapseURL,
      secret: matrixSecret,
    },
    secrets: {
      encryption: randomBytes(32).toString("hex"),
      keys: [{ key: masKey }],
    },
    passwords: { enabled: false },
    clients: [
      {
        client_id: downstreamID,
        client_auth_method: "none",
        redirect_uris: [callback],
      },
    ],
    upstream_oauth2: {
      providers: [
        {
          id: providerID,
          issuer,
          client_id: "mobile-messenger-mas",
          client_secret: clientSecret,
          token_endpoint_auth_method: "client_secret_basic",
          scope: "openid profile",
          discovery_mode: "insecure",
          pkce_method: "always",
          fetch_userinfo: true,
          additional_authorization_parameters: { prompt: "login" },
          claims_imports: {
            skip_confirmation: true,
            localpart: {
              action: "require",
              template: "{{ user.preferred_username }}",
              on_conflict: "fail",
            },
            displayname: {
              action: "require",
              template: "{{ user.preferred_username }}",
            },
            email: { action: "ignore" },
          },
        },
      ],
    },
  };
  await secret("mas.json", JSON.stringify(masConfig));
  const synapseConfig = {
    server_name: "localhost",
    public_baseurl: `${synapseURL}/`,
    pid_file: "/tmp/synapse.pid",
    report_stats: false,
    enable_registration: false,
    federation_domain_whitelist: [],
    listeners: [
      {
        port: synapsePort,
        type: "http",
        tls: false,
        x_forwarded: false,
        bind_addresses: ["0.0.0.0"],
        resources: [{ names: ["client"], compress: false }],
      },
    ],
    database: {
      name: "psycopg2",
      args: {
        user: "synapse",
        password: passwords.synapse,
        database: "synapse",
        host: "127.0.0.1",
        port: 5432,
        cp_min: 1,
        cp_max: 5,
      },
    },
    signing_key_path: "/data/localhost.signing.key",
    media_store_path: "/data/media",
    macaroon_secret_key: random(),
    form_secret: random(),
    trusted_key_servers: [],
    matrix_authentication_service: {
      enabled: true,
      endpoint: `${masURL}/`,
      secret: matrixSecret,
    },
  };
  await secret("synapse.json", JSON.stringify(synapseConfig));
  await runContainer(`${prefix}-synapse`, [
    ...sharedNetwork,
    ...sharedMount,
    "--tmpfs",
    "/data:mode=1777",
    "-e",
    `UID=${process.getuid()}`,
    "-e",
    `GID=${process.getgid()}`,
    "-e",
    "SYNAPSE_CONFIG_PATH=/secrets/synapse.json",
    synapseImage,
  ]);
  await runContainer(`${prefix}-mas`, [
    ...sharedNetwork,
    ...sharedMount,
    "--user",
    user,
    masImage,
    "server",
    "-c",
    "/secrets/mas.json",
  ]);
  await waitFor(async () => (await fetch(`${masURL}/health`)).ok, "MAS");
  try {
    await waitFor(
      async () => (await fetch(`${synapseURL}/_matrix/client/versions`)).ok,
      "Synapse",
    );
  } catch (error) {
    // Startup-only diagnostic; no accounts or tokens exist at this point.
    const logs = await command("docker", ["logs", `${prefix}-synapse`], {
      includeStderr: true,
    }).catch(() => "");
    console.error(
      logs
        .split("\n")
        .filter((line) =>
          /Error|error|Missing|missing|Config|config/.test(line),
        )
        .slice(-12)
        .join("\n"),
    );
    throw error;
  }
  const discovery = await (
    await fetch(`${masURL}/.well-known/openid-configuration`)
  ).json();
  assert.equal(discovery.issuer, `${masURL}/`);
  async function login(phone, deviceID) {
    const jar = new Map();
    const browser = async (url, options = {}) => {
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
        jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return response;
    };
    const verifier = random();
    const state = random();
    const query = new URLSearchParams({
      client_id: downstreamID,
      redirect_uri: callback,
      response_type: "code",
      scope: `openid urn:matrix:client:api:* urn:matrix:client:device:${deviceID}`,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    let current = `${discovery.authorization_endpoint}?${query}`;
    let response = await browser(current);
    let code;
    for (let i = 0; i < 25; i++) {
      if ([302, 303, 307].includes(response.status)) {
        const next = new URL(response.headers.get("location"), current);
        if (next.origin === new URL(callback).origin) {
          assert.equal(next.searchParams.get("state"), state);
          code = next.searchParams.get("code");
          assert.ok(code, next.searchParams.get("error"));
          break;
        }
        current = next.href;
        response = await browser(current);
        continue;
      }
      const html = await response.text();
      assert.equal(
        response.status,
        200,
        `Login step failed (${new URL(current).pathname})`,
      );
      const form = /<form\b([^>]*)>([\s\S]*?)<\/form>/.exec(html);
      assert.ok(form, `No form on ${new URL(current).pathname}`);
      const fields = new URLSearchParams();
      for (const input of form[2].matchAll(/<input\b[^>]*>/g)) {
        const name = /name="([^"]+)"/.exec(input[0])?.[1];
        const value = /value="([^"]*)"/.exec(input[0])?.[1];
        if (name && value !== undefined)
          fields.set(
            name,
            value.replaceAll("&amp;", "&").replaceAll("&#x2f;", "/"),
          );
      }
      if (new URL(current).origin === issuer) {
        if (html.includes('name="phone"')) fields.set("phone", phone);
        if (html.includes('name="code"')) {
          const otp = new Promise((resolve) => {
            const handler = (message) => {
              if (message.kind === "otp") {
                backend.off("message", handler);
                resolve(message.code);
              }
            };
            backend.on("message", handler);
          });
          backend.send({ kind: "otp", phone, id: 1 });
          fields.set("code", await otp);
        }
      }
      // MAS's authorize/registration pages submit the affirmative named button.
      for (const button of form[2].matchAll(/<button\b[^>]*>/g)) {
        const name = /name="([^"]+)"/.exec(button[0])?.[1];
        const value = /value="([^"]*)"/.exec(button[0])?.[1];
        if (name && value && !["deny", "cancel"].includes(value))
          fields.set(name, value);
      }
      const action = /action="([^"]*)"/.exec(form[1])?.[1] ?? current;
      const target = new URL(action.replaceAll("&amp;", "&"), current);
      response = await browser(target, {
        method: "POST",
        headers: {
          Origin: new URL(current).origin,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: fields,
      });
      current = target.href;
    }
    assert.ok(code, "Matrix login did not complete");
    const exchanged = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: downstreamID,
        redirect_uri: callback,
        code_verifier: verifier,
        code,
      }),
    });
    assert.equal(exchanged.status, 200);
    const tokens = await exchanged.json();
    const who = await fetch(`${synapseURL}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    assert.equal(who.status, 200);
    const matrixAccount = await who.json();
    const db = new pg.Pool({ connectionString: backendDatabase });
    let subject;
    try {
      subject = (await db.query("SELECT id FROM users WHERE phone=$1", [phone]))
        .rows[0].id;
    } finally {
      await db.end();
    }
    assert.equal(
      matrixAccount.user_id,
      `@u_${subject.replaceAll("-", "")}:localhost`,
    );
    assert.equal(matrixAccount.device_id, deviceID);
    return { ...tokens, ...matrixAccount };
  }
  const alice = await login("+15552999001", "OIDCSMOKETEST01");
  const bob = await login("+15552999002", "OIDCSMOKETEST02");
  const { assertEncryptedRoundtrip } =
    await import("../../web/scripts/matrix-encrypted-roundtrip.mjs");
  await assertEncryptedRoundtrip(synapseURL, alice, bob);
  console.log(
    "OTP -> OIDC -> MAS -> Synapse passed: stable UUID/device mapping and encrypted SDK delivery verified.",
  );
} finally {
  await cleanup();
}
// The Matrix SDK can retain retry timers after stopClient in Node.js.
process.exit(0);
