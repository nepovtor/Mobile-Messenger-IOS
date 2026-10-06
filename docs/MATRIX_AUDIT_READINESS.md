# Matrix audit evidence and remaining release gates

Date: 2026-10-06. Branch: `feat/matrix-e2ee-migration`.
**Implementation is incomplete; production E2EE is not approved.**
This document is preparation for an external review, not an independent audit.

## Implemented lifecycle boundary

NestJS owns the immutable UUID/account status. MAS owns Matrix credentials and
sessions. A private `matrix_lifecycle` PostgreSQL schema stores immutable
Nest chat → Matrix room registrations and a per-account revocation outbox.
Invoking session revocation or updating/deleting an account enqueues the request
in the same transaction; rolled-back changes cannot leave an external revocation.
The queue is not exposed to Supabase's public Data API, has RLS/default-deny
PUBLIC privileges, and uses invoker functions with a fixed search path.

The worker leases jobs with `FOR UPDATE SKIP LOCKED`. Network requests happen
outside database transactions. Completion is conditional on the lease and records
only the handled generation; a concurrent request remains pending. Requests have
an overall timeout shorter than the lease. Failures retry without emitting tokens,
phone numbers, request bodies or remote session responses into logs. Startup
checks that the private schema exists. Operations must monitor pending/attempted
jobs and queue age; a healthy HTTP process is not proof that MAS is reachable.

The machine credential is an independent 256-bit private-file secret for a static
MAS `client_credentials` client with `urn:mas:admin`. The client looks up the exact
`u_<UUID-without-hyphens>` account, locks it, and drains active browser, OAuth2,
compatibility and personal sessions (including actor/owner delegated tokens).
It verifies resource identity/type and never follows a supplied pagination URL
with its bearer credential. MAS 1.26 has no single all-session endpoint; finishing
all categories and retaining the lock are both necessary.

Any Nest user session/device revocation currently conservatively revokes **all**
Matrix sessions of that account. There is no audited one-to-one Nest-session ↔
MAS-device mapping yet. An unavailable/pending MAS job returns 503 instead of a
successful global-revocation acknowledgement. Retrying logout with an already
revoked refresh token observes the pending receipt and cannot revoke a newly
created Matrix session or extend its quarantine. This behavior still needs the
real Web/iOS logout UI to show pending/retry state.

The worker never unlocks users. A newly consumed OTP can admit an active account
only after the revocation is settled and a 360-second signed-ID-token quarantine
has elapsed. This covers the upstream ID token's 300-second TTL plus clock skew;
a signed token cannot be retracted. Account reactivation alone cannot revive
old tokens. The bridge rejects authenticated code/session timestamps at or before
the server's revocation fence, and stores each opaque access token's **original**
OTP time via `oidc-provider.extraTokenClaims`; changing/re-authenticating its
browser session cannot revive it. Existing tokens without that authenticated
extra field fail closed once a fence exists.

MAS lock ownership is matched at PostgreSQL microsecond precision (Rust lock
responses can contain nanoseconds). A pre-existing external administrator lock
is not automatically removed. A crash between remote locking and saving ownership
can require operator repair; it must fail closed. MAS/admin and PostgreSQL remain
trusted for account/lease/replay-state integrity. A database rollback can resurrect
state; encryption at rest alone does not prevent that. Review coordinated restore
and monotonic revocation before production.

## Immutable room registration and legacy migration

`GET /api/matrix/config`, `GET/POST /api/matrix/chats/{chatID}` and
`GET /api/matrix/revocation` are authenticated and `Cache-Control: no-store`.
They are disabled unless `MATRIX_ENABLED=true`, and carry only configuration and
metadata, never Matrix access tokens, messages or private keys. The contract is
synchronized for Swift and TypeScript.

Room binding requires active chat membership and the current epoch, serializes on
the same chat row as legacy writers, and irreversibly enables the existing
plaintext fence in that transaction. Conflicting concurrent bindings have one
winner; retries for the same room/epoch are idempotent. A trigger prevents updating
or deleting a binding, and the existing no-downgrade/plaintext-write triggers remain
intact. Rollback refuses to discard bindings or any revocation history.

Room version 12 IDs are opaque and need not contain a server-name suffix. A room
ID's syntax and this backend binding **do not attest encryption, ownership or
membership**. Before every send, the official client must check the configured
homeserver/account, actual room encryption, intended membership and device trust.
`boundEpoch` records the registration epoch separately from current `epoch`;
clients must refuse sending when they differ until a reviewed membership migration
is completed. Binding is metadata groundwork, not a working encrypted product chat.

Old messages/backups are not re-encrypted or removed. Client-side import, sender
attribution, duplicate detection and retention still need review. The legacy DB
fence also blocks normal deletion in protected chats. Do not temporarily disable
it to purge data. Prepare a separate audited maintenance path and an explicit
retention/backup inventory; no production purge is authorized by this change.

## Reproducible checks

- `Scripts/test-matrix-lifecycle.sh`: isolated real PostgreSQL migrations; chat
  membership, stale epochs, conflicting/idempotent binding, opaque v12 IDs,
  immutable/fenced writes, protected rollback, lease/generation races and
  unavailable-MAS acknowledgement behavior; reuses all plaintext race tests.
- `server/test/session-security.e2e.test.ts`: controlled concurrent last-seen
  read/update versus revocation; checks the revoked session cannot be resurrected.
- `server/test/mas-admin.client.test.ts`: all five session filters, foreign/malformed
  resources, ignored hostile pagination links and lock timestamp precision.
- `Scripts/test-oidc-bridge.sh`: genuine OTP/OIDC/PostgreSQL flows plus a revocation
  fence test rejecting outstanding codes and old userinfo tokens even after the
  provider browser session's login time advances.
- `node oidc-bridge/scripts/matrix-stack-smoke.mjs`: real pinned MAS/Synapse/bridge/
  PostgreSQL; stable UUID/device mapping, official Rust-backed JS encrypted message
  delivery and ciphertext-only wire event, account blocking, rejected access and
  refresh tokens, unaffected second account, account reactivation without token
  revival, and fresh OTP login after quarantine. Only the disposable fixture's
  quarantine deadline is advanced; its authentication fence remains unchanged.
- `ops/matrix-staging/validate-local.sh`: Compose, pinned MAS/Synapse and Nginx
  configuration checks. Temporary self-signed validation certificates are never
  deployed or used to bypass TLS client verification.

These checks do not prove iOS↔Web interoperability or browser cookie behavior.

Latest local results: backend **154/154**, Web **91/91**, bridge **1 configuration
and 15 integration tests**, lifecycle/plaintext PostgreSQL **25/25**, staging
configuration **6/6**, synchronized **81-operation** OpenAPI contract, Web/backend
lint/format/build and iOS Release simulator build. The pinned real Matrix stack
passed the revocation/fresh-OTP/ciphertext exchange above. iOS↔Web acceptance
and an external audit were not performed.

## External review scope and production gates

1. Review the identity bridge, account collision policy, immutable UUID mapping,
   issued/pending OAuth grants, revocation ordering/quarantine, external admin
   locks, lease expiry/crashes, restore and signing/cookie/storage-key rotation.
   Verify the pinned provider/SDK/image versions and SBOM against their advisories.
2. Finish real iOS and Web OIDC login, secure token vault/Keychain, long-running
   sync, SDK timeline routing, idempotent send/retry, session refresh and logout.
   Current SDK store helpers remain disconnected from product messaging.
3. Implement SAS/cross-signing verification, identity-change warnings, recovery/
   secret storage and usable lost-key behavior. Audit key-sharing policy and
   malicious homeserver/device-list/membership races.
4. Move groups, text/edits/redactions, encrypted images/files/voice and sensitive
   events to official Matrix SDKs. Run both directions of iOS↔Web, offline,
   tamper/duplicate, multi-device, removal/rotation, restore/recovery acceptance.
5. Complete the separately isolated TLS staging deployment. SSH was verified on
   Cloudways, but Docker/Podman are absent and the master account is denied sudo.
   An administrator-managed environment or separate VM is required. See
   [staging runbook](../ops/matrix-staging/README.md). No remote deployment occurred.
6. Approve the revised group security claim: Megolm does **not** provide the former
   strict group PCS guarantee. Approve plaintext/backup retention and migration.
7. Commission an external cryptographic/deployment audit and resolve its findings
   before any production traffic. No auditor was contacted by this implementation.
