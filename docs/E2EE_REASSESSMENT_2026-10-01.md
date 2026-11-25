# E2EE reassessment — 2026-10-01

Status: **blocked; no production E2EE or cross-platform cryptographic implementation**.
This is a source review and local verification, not an independent audit.
The submitted task ends during library evaluation item 3; remaining requirements
must be recovered before a transport redesign is finalized.

## Architecture evidence

| Area | Existing implementation | Missing security property |
| --- | --- | --- |
| iOS | `Data/Repositories/DefaultChatRepository.swift`, REST and realtime services send text/captions and upload media; `Data/Local/SwiftDataChatStore.swift` caches domain messages. `App/Security/KeychainTokenStore.swift` stores authentication material with device-only, unlocked accessibility. | No protocol identity/session store, ratchet, authenticated payload encryption, safety-number verification or encrypted attachment pipeline. Token Keychain storage is not a cryptographic session store. |
| Web | `features/chat/api/chatApi.ts` sends plaintext JSON, edits and audio blobs; chat store and realtime client handle legacy messages. | No E2EE engine, encrypted IndexedDB session lifecycle, identity verification or decrypt-before-render path. |
| Devices | `server/src/modules/devices/`: public identity/signed keys, one-time key publishing/status/claim, identity change versioning, chat epoch bumps, revocation plus authentication session revocation. | Server key bytes do not establish authenticated client sessions. Signature verification and identity trust must be performed by the selected protocol/client. |
| Delivery | `server/src/modules/encrypted-messages/`: strict canonical base64, size bounds, participant/device authorization, exact active-device envelope coverage, idempotency/conflict checks, inbox and per-device realtime delivery/read receipts. | `opaque-v1` test payloads are arbitrary bytes; no proof of encryption, replay security or protocol interoperability. |
| Storage | `20260731100000-E2EEOpaqueDeliverySchema.ts`: public devices/prekeys, ciphertext envelopes/attachments and constraints; old message/media schema remains. | Legacy content is still plaintext. A server membership epoch is authorization metadata, not cryptographic group rotation. |
| Authentication recovery | `server/src/modules/sessions/`: access JWTs, refresh rotation/reuse detection and family/device revocation. | Authentication refresh does not recover ratchet state or message keys. Cryptographic recovery, key loss and multi-device linking are absent. |
| Contract | `contracts/openapi.json` includes device, prekey, encrypted inbox and encrypted media operations; generated clients pass synchronization checks. | Existing operation paths do not specify a complete interoperable cryptographic protocol. |

Existing production guards, generic push and redaction are retained. No private
keys or cryptographic primitives have been added to the server.

## Corrected plaintext policy bypass

Before this change, `ChatService.requirePlaintextMessages()` checked only the
global environment flag. A chat created with `e2ee_required=true` could accept
legacy plaintext when a later deployment disabled `E2EE_REQUIRED`.

REST send, realtime send, edit and delete now also reject the stored chat policy.
The regression test exercises all four entry points and verifies no message row
was persisted. Global production rejection remains intact. This is a boundary
fix, not encryption. Legacy read permission is unchanged to preserve the
documented migration path. The October 6 follow-up below closes the race left
by the original check.

## Library assessment

Release versions below were checked against official GitHub release metadata on
2026-10-01. A latest release is not a promise of long-term support or proof of
compatibility. No candidate is installed or approved by this report.

| Candidate | Verified release | Integration assessment | Decision |
| --- | --- | --- | --- |
| Official libsignal | [0.103.1](https://github.com/signalapp/libsignal/releases/tag/v0.103.1), released September 22 | Official podspec specifies Swift 5 / iOS 15, compatible with this project's declared Swift 5 / iOS 17 baseline in principle. Canonical integration uses CocoaPods and checksummed Rust FFI; SwiftPM consumption is unsupported. TypeScript distribution uses Node native addons rather than a supported browser/WASM target. AGPL-3.0-only. | Cannot satisfy the current Vite browser client through its official distribution. No fork/custom ratchet workaround. Xcode 26.3 build compatibility has not been tested with this dependency. |
| Matrix Rust SDK + crypto-wasm | [SDK 0.19.1](https://github.com/matrix-org/matrix-rust-sdk/releases/tag/matrix-sdk-0.19.1), September 18; [WASM 18.9.0](https://github.com/matrix-org/matrix-sdk-crypto-wasm/releases/tag/v18.9.0), September 21 | Official Apple bindings generate Swift/UniFFI XCFrameworks; full SDK has Swift package distribution and crypto-only has a CocoaPods route. WASM provides browser ESM and asynchronous initialization. React has no direct coupling to the state machine. Requires Matrix device/key query, to-device exchange, room state and sync semantics. | Strong integration candidate, not a drop-in choice. Current custom prekey/envelope API needs a reviewed lifecycle mapping or a Matrix transport migration. Megolm group security does not satisfy the existing strict PCS requirement without an explicitly reviewed change in design. |
| OpenMLS | [0.9.0](https://github.com/openmls/openmls/releases/tag/openmls-v0.9.0), August 25 | Mature standards-based MLS building block; Swift/browser host bindings, credential authentication, delivery service, persistent state and recovery still require integration. Upstream lists iOS and WASM as built but untested targets. | Not approved as a supported cross-platform drop-in. A reviewed prototype and upstream vectors on both targets are necessary. |

Sources: [libsignal support statement](https://github.com/signalapp/libsignal),
[versioned Swift instructions](https://github.com/signalapp/libsignal/blob/v0.103.1/swift/README.md),
[podspec](https://github.com/signalapp/libsignal/blob/v0.103.1/LibSignalClient.podspec),
[Matrix Apple integration](https://github.com/matrix-org/matrix-rust-sdk/blob/matrix-sdk-0.19.1/bindings/apple/README.md),
[versioned WASM instructions](https://github.com/matrix-org/matrix-sdk-crypto-wasm/blob/v18.9.0/README.md),
[OpenMLS support matrix](https://github.com/openmls/openmls/blob/openmls-v0.9.0/README.md).

The [Megolm specification security discussion](https://github.com/matrix-org/matrix-spec/blob/main/content/olm-megolm/megolm.md)
states that a compromised ratchet exposes subsequent messages in that session
and describes only partial forward secrecy for retained receiving state.
Periodic rotation alone must not be represented as guaranteed recovery from
compromise: distributing replacement keys through compromised sessions needs
a separately justified recovery protocol.

The checked local environment is Xcode 26.3; project deployment target iOS 17
and Swift language mode 5. Locked web build uses Vite 6.4.3 and React 19 with
TypeScript. Existing builds passing is not evidence that a new crypto SDK
passes these builds or interoperability tests.

## Blocking decisions and audit gates

1. Recover the remaining user requirements and select a protocol that satisfies
   them, including the documented forward secrecy and PCS objectives for groups.
2. Resolve official browser support for Signal, or choose a reviewed Matrix/MLS
   architecture. Never equate Matrix Olm/Megolm serialization with Signal
   prekeys or the current custom envelope format.
3. Record dependency license obligations and project licensing. Backend
   `package.json` declares MIT, but no tracked root LICENSE/NOTICE was found;
   it does not authorize relicensing the whole project.
4. Implement and pin reproducible Swift/browser artifacts and protocol stores;
   prove official vectors and iOS ↔ browser interoperability before enabling
   encrypted sends.
5. Complete identity-change UX, authenticated linking/recovery, multi-device
   fan-out, replay/skipped-key bounds, group rekey and attachment authentication.
6. Obtain independent cryptographic review. Mock/pg-mem tests are not
   substitutes for PostgreSQL concurrency tests; the latter are described in
   the October 6 follow-up below.

Production must retain `E2EE_REQUIRED=true`; the legacy clients cannot provide
production messaging through that boundary yet. No release or deployment was
performed. Pre-existing iOS source moves and other user changes were preserved.

## Local verification

- Backend build and lint passed; complete suite: 134 tests passed (including
  the stored-policy regression and its realtime subtest).
- Web build, lint and generated contract check passed; 26 test files / 88 tests
  passed. Contract synchronization covers 74 operations.
- iOS simulator build-for-testing and test-without-building passed using
  Xcode 26.3 / iPhone 17 Pro simulator: 84 tests, zero failures.
- `Scripts/verify-production-security.sh` and `git diff --check` passed.
- No actual PostgreSQL migration/concurrency run, new dependency build,
  upstream cryptographic vectors or iOS/web crypto interoperability run was
  performed at the time of this October 1 review. None is implied by these
  results.

## Follow-up: transactional policy fence — 2026-10-06

`ChatService` now uses one transaction for each legacy create, edit, delete,
and read-receipt mutation. It locks the chat row with `SELECT ... FOR UPDATE`
before reading participant/message rows, checks the stored `e2ee_required`
value and global `E2EE_REQUIRED`, then writes through the same TypeORM
transaction manager. REST and WebSocket send paths call this shared service.
Chat metadata and participant read state commit with the message. Realtime and
push delivery happen after commit; a rollback emits no success event. A failed
SQL operation is returned as a generic HTTP error so TypeORM's SQL parameters
cannot enter the framework exception log or client response as plaintext.

The new `LegacyMessagePolicyFence20261001120000` migration installs a trigger
on `messages` INSERT, UPDATE and DELETE. Direct writers, including the demo
seeder, take the same chat row lock and reject mutations after E2EE is enabled.
A second trigger forbids changing `chats.e2ee_required` from true to false.
The demo seeder also skips chats already marked protected. There is no public
policy-toggle route; in this phase an authorized migration/operator performs
the atomic `UPDATE chats SET e2ee_required = true ...` operation. A participant
cannot disable it through the application API or a later global flag change.

On PostgreSQL's default `READ COMMITTED` isolation, the waiter on the chat row
sees the committed policy after the lock holder commits. If plaintext takes
the lock first, it commits before activation can complete. If activation
takes the lock first, the waiting legacy mutation sees the new policy and
rolls back. The integration tests observe actual blocked backend PIDs through
`pg_blocking_pids`, then release a held transaction. Their result does not
depend on a timing guess. Application writers lock chat before message rows;
the trigger is a final guard for other writers. Raw SQL UPDATE/DELETE obtains
a message row lock before the trigger's chat lock, so mixed raw writers can
still deadlock; PostgreSQL aborts one transaction rather than committing an
unsafe mutation. Such writers should follow the documented chat-first order.

The dedicated test command is `cd server && E2EE_TEST_PGPORT=<local-port> npm
run test:postgres:e2ee`. `Scripts/test-e2ee-postgres.sh` refuses a non-loopback
host, creates a disposable database named `mm_ci_e2ee_*`, applies all TypeORM
migrations, runs the API/concurrency suite, and drops the database. It never
uses production credentials. The test covers normal plaintext send, protected
create/edit/delete/read, both lock orders for create/edit/delete, REST and
WebSocket, direct SQL write/downgrade rejection, forced SQL failure rollback,
and a nonparticipant request. The migration smoke script was corrected to
hold every migration after the legacy fixture cutoff, so the trigger cannot
be installed before its `e2ee_required` column. Trigger functions use invoker
privileges and revoke direct `PUBLIC` execution.

This protects the legacy database mutation boundary, not message content
cryptographically. Legacy rows and permitted legacy reads still contain
plaintext. Service owners with DDL privileges can remove database triggers;
deployment must limit those privileges and apply this migration before
relying on the per-chat flag. There is no reviewed key protocol, client
session store, device identity UX, encrypted attachment pipeline, group rekey
or iOS/web interoperability. External design review and staging migration
drills remain release gates. The trigger also blocks routine deletion of
legacy message rows in a protected chat. A later retention/purge migration
must define a separately reviewed maintenance procedure; it must not silently
reopen legacy writes.

### Verification on 2026-10-06

| Check | Result |
| --- | --- |
| Backend unit/API suite | 134 passed, 0 failed |
| Isolated PostgreSQL 18 API/concurrency suite | 14 passed (13 scenarios and their parent test), 0 failed; both lock orders observed with `pg_blocking_pids` |
| PostgreSQL migration smoke | Clean up/down/up and legacy upgrade passed after correcting migration ordering |
| Web suite | 88 passed in 26 files, 0 failed |
| iOS simulator suite | 84 passed, 0 failed on Xcode 26.3 / iPhone 17 Pro simulator |
| Backend/Web lint, format and production builds | Passed |
| OpenAPI contract | 74 operations synchronized |
| Production invariants | Passed |
| Backend production dependency audit | 0 vulnerabilities after updating Nest 11.2.7, sharp 0.35.5 and vulnerable transitive packages |
| Web production dependency audit | Passed |

PostgreSQL 16, the version used by the project's Docker development image,
was not available locally. The existing PostgreSQL 16 migration CI job now
runs the same concurrency suite; that CI result has not yet been observed.
No production database or deployment was touched. The backend
legacy mutation boundary is prepared for the next client E2EE integration
stage, subject to applying the new migration. The messenger remains blocked
from a production E2EE claim.
