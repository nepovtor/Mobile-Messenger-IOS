# Matrix E2EE migration decision

Decision date: 2026-10-06. Status: **implementation in progress; production E2EE blocked**.

The product owner selected a Matrix-compatible transport and explicitly accepted
revisiting the former group post-compromise-security (PCS) requirement. The
existing phone OTP login must remain, with a separate OIDC bridge upstream of
Matrix Authentication Service (MAS). This is an architecture decision, not a
claim that the current messenger encrypts messages.

## Protocol boundary

Use a self-hosted Matrix homeserver (Synapse) for room state, device lists,
to-device messages, sync, media and encrypted event delivery. Use MAS for
Matrix authentication and an independently reviewed OIDC provider backed by
the existing OTP-authenticated user identity. The NestJS server remains the
authority for legacy account/profile/product features during migration. It
must not translate legacy plaintext into Matrix ciphertext, hold Matrix
private keys, manufacture Matrix access tokens, or implement Olm/Megolm.

The web client uses the official `matrix-js-sdk` Rust/WASM crypto path. The
iOS client uses the official `MatrixRustSDK` Swift package. Matrix room IDs,
membership and cryptographic device identities are separate from existing
NestJS chat IDs, server `membership_epoch`, and custom prekey/envelope rows.
Do not submit Matrix events through `/encrypted-messages`: that API is not a
Matrix Client-Server API and lacks its key-query, to-device, sync, room-state
and signing semantics. The NestJS endpoint now rejects `matrix` protocol
labels to make that transport boundary explicit.

Matrix's Megolm group sessions do not provide the project's previous strict
PCS guarantee after a compromised group session until new session keys are
distributed. Room membership changes require new outbound sessions and
withholding old room keys from removed members; a server-side membership epoch
alone does not prove either. This limitation must be part of the product
security claim and an independent design review.

## Reproducible dependency spike

| Component | Pinned version | Verified here | Remaining gate |
| --- | --- | --- | --- |
| `matrix-js-sdk` | 43.0.0 in `web/package-lock.json` | React/Vite TypeScript production build and browser bundle; Rust crypto wrapper tests | Real homeserver sync, recovery, device verification and interop |
| `MatrixRustSDK` Swift package | 26.10.02 tag, resolved commit `55650a2320cc6e3264c1d5508a5094f8dd7e51a5` | Xcode 26.3 iOS simulator build and 85 tests | Authenticated session restore, room/timeline integration and interop |
| Synapse | 1.162.0, image digest `sha256:6b84a7bbac36f080b2d2e51e0289cf1b08b349598ea44a558df38d558f2c2311` | Password and OTP/MAS-authenticated encrypted room roundtrips on disposable PostgreSQL | Reviewed TLS deployment, restore/revocation and client acceptance tests |
| MAS | 1.26.0, image digest `sha256:e089f1048a1d4a9a492ed17b9fe759100f1bd619407b001f5927928d88b780c4` | Real upstream OTP/OIDC login, UUID localpart, admin session revocation and fresh-OTP re-admission | Reviewed device mapping/restore, TLS and production operations |
| OTP OIDC bridge | `oidc-provider` 9.12.2, `pg` 8.23.1, exact lockfile | Real NestJS OTP and PostgreSQL tests; signature/claims/S256/CSRF/restart/concurrency; full MAS/Synapse encrypted SDK roundtrip | Independent identity/lifecycle review, browser/iOS login, key rotation and restore |

The Swift package manifest pins a checksum for its XCFramework. The iOS
`MatrixClientFactory` requires HTTPS and passes a random 32-byte Keychain key
to the official encrypted SQLite store. The web startup requires HTTPS (or
development loopback), a caller-supplied 32-byte IndexedDB wrapping key and a
cross-tab Web Lock. Neither helper is connected to user messaging yet. The web
key must come from an approved interactive unlock/recovery flow; it cannot be
persisted in `localStorage`, an ordinary cookie or a backend table. The iOS
Keychain item is device-only; loss of that item makes the existing local store
unreadable. All Matrix tokens/sessions need a separate lifecycle review.

`Scripts/test-matrix-web-smoke.sh` starts a disposable Synapse container bound
only to loopback, registers random test accounts, creates an encrypted room
through the official Web SDK, and asserts that Bob decrypts Alice's ciphertext
event. It deletes the container, database and test credentials on exit. It uses
temporary password login and in-memory crypto stores solely to exercise the
protocol; it is **not** the product's OTP/OIDC flow or an iOS↔Web acceptance
test. The CI Web job runs this harness on Node.js 22.

Sources: [Matrix JS SDK crypto initialization](https://github.com/matrix-org/matrix-js-sdk/tree/v43.0.0#end-to-end-encryption-support),
[official Swift package](https://github.com/matrix-org/matrix-rust-components-swift/tree/26.10.02),
[Synapse release](https://github.com/element-hq/synapse/releases/tag/v1.162.0),
[MAS release](https://github.com/element-hq/matrix-authentication-service/releases/tag/v1.26.0),
[MAS upstream OIDC](https://element-hq.github.io/matrix-authentication-service/setup/sso.html),
[Synapse MAS integration](https://element-hq.github.io/matrix-authentication-service/setup/homeserver.html).

## OTP/OIDC integration implemented

The separate [OIDC bridge](../oidc-bridge/README.md) uses the supported official
`oidc-provider` authorization server; NestJS does not implement the OIDC protocol.
The backend service boundary `/api/auth/oidc/{request,verify,account}` is disabled
by default and requires an independent 256-bit service secret. Browser requests
and ordinary NestJS JWTs do not authorize those routes. OTP consumption,
authorization checks and rate limits share the existing AuthService. Verification
returns only the existing immutable UUID and authentication time, without NestJS
sessions/tokens, a phone number or debug OTP. Existing contact-only legacy accounts
retain their UUID.

The bridge registers only the confidential MAS client with an exact callback;
it requires code flow, S256 PKCE, query response mode, an exact Origin, signed
interaction cookies and a one-use CSRF nonce. It uses encrypted private PostgreSQL
artifacts, hashed/index-bound identifiers, conditional atomic code consumption,
checked TTLs and a durable rate limit shared between bridge instances. It rechecks
active backend accounts before OIDC token issuance and userinfo. A review also
found and fixed stale account saves which could overwrite an administrator's
concurrent block during ordinary or OIDC login; updates now touch only intended
columns and check active status at the timestamp write.

`Scripts/test-oidc-bridge.sh` runs a disposable PostgreSQL 16 database with real
NestJS migrations and HTTP OTP/OIDC exchanges. On Node.js 22 LTS it passed one
configuration test and all 14 integration tests, including restart recovery,
ID-token signature/issuer/audience/nonce, blocking after OTP, CSRF, wrong PKCE,
storage tampering and concurrent authorization-code redemption. Exactly one of
eight simultaneous HTTP code exchanges succeeds; storage-level contention also
tests 24 concurrent consumers. Backend verification passed 149 tests; Web passed
91 tests; iOS simulator passed 85 tests. Formatting/lint/build and the synchronized
77-operation OpenAPI contract also passed.

`node oidc-bridge/scripts/matrix-stack-smoke.mjs` starts the pinned bridge, MAS,
Synapse and PostgreSQL with synthetic accounts, random temporary credentials,
component-specific database roles and loopback published ports. It passed actual
OTP -> OIDC -> MAS -> Synapse login for two devices, checks Matrix IDs derived from
their original NestJS UUIDs, and completes an official-SDK encrypted room exchange.
The recipient decrypts the message; the raw homeserver event contains ciphertext
without its body. MAS imports a required UUID-derived localpart with
`on_conflict=fail`, never an automatic link based on phone/name. Temporary files,
containers and the generated test image are removed on exit.

This is a test deployment and protocol proof. The HTTP loopback issuer and MAS
`discovery_mode=insecure` are deliberately restricted to the disposable harness;
the bridge rejects these settings in production. No production configuration,
database, account, deployment or plaintext-retention setting was changed.

The next lifecycle increment adds transactional MAS revocation and immutable
room registration with the existing plaintext fence. See
[audit evidence and limits](./MATRIX_AUDIT_READINESS.md) and the
[isolated sslip.io TLS staging runbook](../ops/matrix-staging/README.md).
The real stack test now rejects the blocked user's old Matrix access/refresh
tokens, preserves a second user's session, and admits fresh OTP after account
reactivation/quarantine; reactivation alone never restores old tokens.
A revocation-time fence also invalidates old upstream authorization codes and
opaque tokens, including after browser reauthentication. Any Nest user/device
revocation conservatively revokes all Matrix sessions. MAS failures return pending
503; the global logout/recovery UI still needs integration. Signed upstream tokens
require a 360-second quarantine before automatic fresh-OTP unlock.

**Deployment blocker:** SSH access on the supplied Cloudways account was verified,
but Docker/Podman are absent and sudo is explicitly denied. No packages, virtual
hosts, databases or production services were changed remotely. Generated staging
configurations passed local Compose/MAS/Synapse/Nginx checks; no Lets Encrypt
certificate or remote Matrix service exists yet. Actual product chats, recovery,
verification, groups/attachments, backup retention and external audit remain
release gates.

## Required work before the first encrypted product message

1. Complete the bridge release gates: coordinated NestJS/OIDC/MAS logout,
   account/device revocation and backchannel logout; key rotation/storage-key
   migration and restore; real browser/iOS login. Independently review the
   tested UUID mapping and account collision handling.
2. Promote the tested disposable Synapse/MAS/PostgreSQL stack to a separately
   reviewed deployment configuration: TLS/proxy, signing secrets, backup/restore,
   rate limits, federation policy, runtime roles and nonpublic admin endpoints.
3. Complete web and iOS login, secure session storage, crypto-store restore,
   secret storage/recovery, cross-signing, device verification and visible
   identity-change warnings. Do not send into a room until the clients confirm
   encryption and the intended membership/device policy.
4. Implement a reviewed mapping and migration from each NestJS chat to a Matrix
   encrypted room. Freeze legacy writes first; preserve a distinct legacy read
   state. Move text, edits, redactions, reactions, attachments, voice, location
   and sensitive system events through the Matrix clients, never through
   server-readable previews or the old media endpoint.
5. Run iOS-to-web and web-to-iOS interoperability against a disposable Matrix
   deployment: first contact, offline/out-of-order delivery, duplicate and
   tampered events, identity changes, multi-device, revoked devices, group
   membership changes, encrypted attachments, recovery and loss of keys.
6. Inventory and retire legacy plaintext with an approved backup/restore and
   retention procedure. The existing database trigger also blocks ordinary
   deletion after per-chat E2EE enablement, so purge requires a separately
   reviewed maintenance path that never reopens plaintext writes.
7. Obtain independent cryptographic and deployment reviews. Keep
   `E2EE_REQUIRED=true` and fail closed until all release gates pass.

No production database, homeserver, account or deployment was changed by this
decision or SDK spike.
