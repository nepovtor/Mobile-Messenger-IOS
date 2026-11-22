# OTP to OIDC bridge

Status: tested authentication integration; production rollout is blocked by the
release gates below. This service does not encrypt messenger content.

The supported `oidc-provider` authorization server handles OIDC discovery,
authorization codes, signed ID tokens and userinfo. Only the registered MAS
client can use the service. Authorization uses code flow, an exact callback,
query response mode, confidential client authentication and S256 PKCE. Dynamic
registration and refresh tokens are disabled. The interaction UI authenticates
with the existing NestJS OTP service over a separate service credential.

The OTP result is the existing account UUID. Neither a phone number, display
name nor browser-supplied account ID determines the OIDC subject. The bridge
returns `preferred_username=u_<UUID without hyphens>` for an injective Matrix
localpart mapping. MAS must use `localpart.action=require` and
`localpart.on_conflict=fail`; an existing Matrix account is never linked merely
because its username matches.

## Verification

Requires Docker, Node.js 22 LTS, and locked dependencies in `server/` and this
directory:

```sh
cd server && npm ci
cd ../oidc-bridge && npm ci
cd ../web && npm ci
cd ..
Scripts/test-oidc-bridge.sh
node oidc-bridge/scripts/matrix-stack-smoke.mjs
```

The first command creates a disposable loopback PostgreSQL 16 container, applies
the real NestJS migrations, and tests OTP/OIDC using real HTTP and the existing
OTP service. It tests signed ID-token claims, CSRF, identity binding, account
blocking, S256, restart recovery, ciphertext tampering and concurrent code
consumption. Test OTPs are delivered by the mock provider only through the child
process IPC channel, never through a network endpoint.

The second command builds the pinned bridge image and starts disposable
PostgreSQL, MAS and Synapse. Component databases have different non-superuser
owners and deny other roles' connections. Random temporary secrets have mode
0600. All published service ports bind to `127.0.0.1`; database contents and
Synapse files live in tmpfs. It completes OTP login through MAS and verifies
the UUID-derived Matrix ID/device using a MAS-issued token on Synapse's
`whoami`. Two OTP-authenticated devices then exchange an encrypted message with
the official Rust/WASM Matrix SDK. The recipient decrypts it, and the raw
homeserver event must contain ciphertext without its plaintext body. Containers,
generated image and temporary secrets are deleted on exit.
The synthetic NestJS test fixture exposes only the secret-protected bridge
routes. This is an HTTP protocol test; real browser cookie and iOS authorization
session acceptance tests remain required.

The local stack uses shared container networking so its issuer is identical
from the browser and MAS. Its loopback HTTP and MAS `discovery_mode=insecure`
are **test-only** settings. They are not a deployment template for production.

## Configuration and storage

`NODE_ENV=production` requires HTTPS for issuer, callback and backend. Local HTTP
also requires `OIDC_ALLOW_INSECURE_LOCAL=true` and a loopback URL. The only extra
local backend host allowed is `host.docker.internal` for the test fixture.
Configuration is explicit; secrets have no default values:

| Variable | Value |
| --- | --- |
| `OIDC_ISSUER` | HTTPS origin without a path |
| `OIDC_CLIENT_ID` | Registered confidential MAS client ID |
| `OIDC_REDIRECT_URI` | Exact MAS upstream callback URI |
| `OIDC_BACKEND_URL` | Trusted NestJS base URL including `/api` |
| `OIDC_CLIENT_SECRET_FILE` | Canonical base64url encoding of 32 random bytes |
| `OIDC_BRIDGE_SHARED_SECRET_FILE` | Separate 32-byte service secret in base64url |
| `OIDC_STORAGE_KEY_FILE` | Separate 32-byte AES-GCM storage key in base64url |
| `OIDC_COOKIE_KEYS_FILE` | JSON array of independent 32-byte base64url keys; newest first |
| `OIDC_JWKS_FILE` | Private RSA JWK set, RS256, unique stable `kid`, at least 2048 bits |
| `OIDC_DATABASE_URL_FILE` | PostgreSQL connection string |
| `OIDC_PORT` / `OIDC_BIND_HOST` | Port and bind address; default address `127.0.0.1` |
| `OIDC_TRUSTED_PROXY_IP` | Optional exact socket peer permitted to set forwarding headers |

Mount secrets outside the checkout. First run `npm run migrate` with a dedicated
migration role; runtime startup never creates schema implicitly. Grant a runtime
role only schema USAGE and SELECT/INSERT/UPDATE/DELETE on
`oidc_bridge.artifacts` and `oidc_bridge.rate_limits`. Do not grant runtime DDL
or expose this private schema through Supabase Data API. The temporary test stack
uses database-owner roles solely for disposable schema setup.

Provider sessions, grants, tokens and interaction data use AES-256-GCM with fresh
nonces and AAD binding to model and hashed row ID. Index identifiers are hashed
and checked against authenticated payloads. Code consumption uses a conditional
PostgreSQL UPDATE; an expired or already consumed code fails before token
issuance. TTL is checked at reads/consumption and expired rows are pruned. The
database is trusted for replay-state integrity: encryption at rest cannot stop
an administrator rolling back `consumed`, expiry or the entire database.

Interaction forms require the provider's signed interaction cookie, exact Origin
and a single-use CSRF nonce. Input size is bounded. A durable per-IP rate limit
allows 120 requests per minute across instances; bucket IDs use keyed hashes.
Existing per-phone, per-device and OTP attempt limits remain in NestJS. Forwarded
headers are rejected unless the socket peer is explicitly trusted. Startup and
request errors do not log secrets, tokens, phone numbers or OTPs.

## Release gates

- Review actual HTTPS/TLS proxy, DNS, trusted-proxy chain, container/image policy,
  runtime privileges and distributed abuse handling.
- Implement and test coordinated NestJS/OIDC/MAS logout, account deactivation,
  device revocation and backchannel logout. Active-account checks reject future
  OIDC token issuance and userinfo, but **already-issued MAS/Matrix sessions are
  not revoked by blocking or logging out in NestJS**.
- Test signing/cookie key rotation and encrypted-storage key migration, including
  backup restoration. Losing the storage key makes provider state unreadable.
- Add real browser and iOS login/relogin acceptance tests and independently
  review the OTP/OIDC account-linking boundary.
- Integrate client messaging, secure token lifecycle, recovery/cross-signing,
  verified devices and encrypted media before enabling product chat sends.

Backend bridge routes are disabled unless `OIDC_BRIDGE_ENABLED=true` and an
independent canonical 32-byte `OIDC_BRIDGE_SHARED_SECRET` are configured. An
ordinary NestJS JWT or browser request does not grant service access.

Sources: [supported oidc-provider](https://github.com/panva/node-oidc-provider),
[MAS upstream OIDC](https://element-hq.github.io/matrix-authentication-service/setup/sso.html),
[Synapse delegation](https://element-hq.github.io/matrix-authentication-service/setup/homeserver.html).
