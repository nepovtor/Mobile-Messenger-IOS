# Migration to E2EE

Status: protocol/client integration blocked. This is the approved sequencing
plan, not evidence that E2EE is live.

## Non-negotiable rules

- The server never encrypts legacy plaintext and calls it E2EE.
- New production messages are accepted only as protocol-valid per-device
  ciphertext envelopes.
- Legacy rows remain explicitly marked `is_legacy`; no misleading conversion.
- Back up and restore-test before any data deletion.
- Rollback never re-enables plaintext writes.

## Phase 0 — inventory and freeze

1. Select/approve the protocol per
   [E2EE_ARCHITECTURE.md](./E2EE_ARCHITECTURE.md).
2. Inventory legacy rows, media, location rows, chats, participants, devices,
   and oldest/newest timestamps without exporting content.
3. Record database/S3 backup IDs and prove an isolated restore.
4. Disable demo/test/password-registration paths.
5. Rotate any credential that has appeared outside the secret manager.

Useful metadata-only queries:

```sql
select count(*) as legacy_messages,
       min(created_at) as oldest,
       max(created_at) as newest
from public.messages
where is_legacy;

select count(*) as legacy_locations
from public.location_shares
where sharing_enabled;

select count(*) as legacy_media
from public.media;
```

Do not select `messages.text`, coordinates, object keys, phones, or provider
tokens into deployment logs.

## Phase 1 — additive schema

Apply the security/session/contact/device/prekey/envelope/attachment migrations
transactionally. Existing `messages` rows become or remain `is_legacy=true`;
their plaintext is not transformed or deleted. Backfill legacy contacts as
accepted requests, but require a separate location permission going forward.

Run:

```bash
Scripts/migration-smoke.sh
```

This tests a clean PostgreSQL database, up/down/up for the latest migration, and
an existing database with legacy message/contact rows.

## Phase 2 — client dark launch

- Ship protocol/key stores disabled behind a client capability flag.
- Register devices and publish public prekey bundles only after authentication.
- Validate official vectors locally without sending user messages.
- Establish test accounts/devices and compare safety numbers out of band.
- Collect only coarse success/error codes; never keys, plaintext, or full
  ciphertext.

Do not enable `E2EE_REQUIRED` for real traffic until supported iOS and web
clients pass the complete interoperability suite.

## Phase 3 — opaque delivery

For each send:

1. sender resolves current chat membership and active recipient devices;
2. sender claims a prekey bundle when needed;
3. sender encrypts locally and creates one envelope per device;
4. backend checks sender device/session, membership epoch, exact recipient
   device set, sizes, and idempotency;
5. backend stores/delivers opaque bytes;
6. recipient authenticates/decrypts locally and reports delivery/read metadata.

Set in production:

```text
E2EE_ENABLED=true
E2EE_REQUIRED=true
PASSWORD_LOGIN_ENABLED=false
```

Plaintext send/edit/delete/reaction/location routes must return an error.
Push/Telegram/APNs/Web Push must say only “Новое сообщение” or carry an opaque
availability event.

## Phase 4 — legacy read window

Default policy:

- new users/devices do not automatically receive legacy plaintext;
- server-side message search/admin preview remains disabled;
- existing authorized users may use a short, audited compatibility window only
  if product/legal approves;
- set `LEGACY_MESSAGES_READ_ENABLED=false` as soon as the compatibility window
  closes.

Optional user-driven migration is allowed only when an already authorized
client downloads its legacy rows, encrypts locally into protocol-valid
envelopes, uploads them with a migration idempotency record, verifies all
intended devices can decrypt, and then requests server deletion. The server
must never receive the resulting plaintext or attachment keys.

## Phase 5 — deletion

After owner approval, backup/restore evidence, client adoption threshold, and
the legal retention period:

1. stop legacy reads;
2. export metadata-only deletion manifest/counts;
3. delete legacy message plaintext/media/location rows in bounded,
   restartable transactions;
4. vacuum/maintenance per provider guidance;
5. expire versioned S3 objects and database snapshots containing plaintext;
6. verify live DB, replicas, search indexes, logs, analytics, caches, and admin
   APIs contain no plaintext;
7. retain audit evidence without content.

Deletion SQL must be prepared and reviewed against staging immediately before
the operation; it is intentionally not embedded as an automatic repository
command.

## Rollback boundaries

- Before opaque writes: roll back application and additive schema if the tested
  `down` path preserves all legacy data.
- After opaque writes: roll back only to a client/server version that still
  understands the same protocol/envelope schema.
- After plaintext deletion: restore only through the approved backup process;
  never silently repopulate plaintext into a live E2EE environment.
- Protocol/session rollback cannot guarantee recovery of lost client private
  keys.

## Required acceptance tests

- Alice iOS → Bob web and Alice web → Bob iOS;
- offline delivery and out-of-order messages;
- duplicate idempotency and replay rejection;
- tampered ciphertext authentication failure;
- future messages unreadable with old ratchet state;
- exact multi-device envelope fan-out;
- revoked device and removed group member exclusion;
- attachment interoperability/hash/authentication;
- server/admin content unreadability;
- identity-key change warning and verified-state violation;
- group epoch/key rotation;
- metadata-only push and logs.

Use official vectors for the selected library. Passing only server tests is not
an E2EE acceptance result.
