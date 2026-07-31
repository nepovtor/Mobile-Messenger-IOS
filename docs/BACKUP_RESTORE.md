# Backup and Restore Runbook

## Scope and objectives

Back up PostgreSQL, S3 ciphertext objects, deployment configuration metadata
(never plaintext secrets in a ticket), and the exact application commit. Define
RPO/RTO with the product owner before release. A backup is not accepted until a
restore is tested in an isolated environment.

Legacy backups contain plaintext messages and precise location data. Classify
them at the highest sensitivity, encrypt them with a separately managed key,
restrict access, and expire them under the approved retention schedule.

## PostgreSQL backup

Use the provider's point-in-time recovery plus a portable logical backup before
security/E2EE migrations:

```bash
umask 077
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=/secure/backups/mobile-messenger-<utc-timestamp>.dump \
  "$DATABASE_URL"
sha256sum /secure/backups/mobile-messenger-<utc-timestamp>.dump \
  >/secure/backups/mobile-messenger-<utc-timestamp>.dump.sha256
```

Do not enable shell tracing. Avoid URLs with passwords in shared process lists;
prefer provider tooling or a protected passfile/secret injection where
available.

Encrypt the dump using the organization's approved KMS/backup system, upload it
to immutable restricted storage, then remove the local staging copy according
to the host policy.

## S3 inventory/backup

- Enable bucket versioning and provider-side encryption with a managed key.
- Block public access and use a separate backup identity.
- Capture an immutable object inventory including key, version, size, ETag or
  ciphertext hash, and retention status.
- Replicate ciphertext to a separate account/region when required by RPO.
- Never export attachment keys; they are not server assets.

## Restore drill

1. Create an isolated network and a new empty PostgreSQL database.
2. Restore without owner/ACL inheritance:

   ```bash
   pg_restore \
     --clean \
     --if-exists \
     --no-owner \
     --no-acl \
     --dbname="$RESTORE_DATABASE_URL" \
     /secure/backups/mobile-messenger-<utc-timestamp>.dump
   ```

3. Apply only migrations newer than the backup with the reviewed artifact.
4. Reapply/verify Supabase RLS and grants.
5. Run integrity checks:
   - row counts and foreign keys;
   - no seeded/default administrator;
   - active session/revocation consistency;
   - envelope/device ownership;
   - object count and ciphertext hash sampling;
   - legacy/E2EE row counts;
   - application health with outbound push/SMS disabled.
6. Prove anonymous Data API access fails.
7. Record duration, checksum, application commit, database version, exceptions,
   and reviewer.
8. Destroy the isolated restore and its credentials through the approved
   process.

Never connect a restore drill to production push, SMS, Telegram, APNs, email, or
WebSocket consumers.

## Restore during an incident

Prefer restoring to a new database rather than overwriting the suspected
database. Preserve the compromised system for forensics, rotate credentials,
restore, apply migrations and default-deny controls, validate, then switch the
application. Revoke all sessions if authentication tables may have been read or
modified.

## Retention and deletion

Retention needs product/legal approval. Deleting live legacy plaintext does not
remove it from older backups. Track the final backup expiry date and verify
provider versioned objects/snapshots are destroyed at the end of retention.

Backup deletion is a privileged two-person operation with audit evidence; no
repository script automatically deletes backups.
