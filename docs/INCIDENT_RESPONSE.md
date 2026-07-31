# Incident Response

## Priorities

1. Protect people and stop ongoing unauthorized access.
2. Preserve reliable evidence without copying message content unnecessarily.
3. Revoke/rotate affected authority.
4. Restore a known-good service with the E2EE/plaintext boundary intact.
5. Notify owners, providers, users, and regulators as required.

Never weaken `E2EE_REQUIRED`, enable test OTPs, expose pgAdmin/database ports, or
restore a default administrator as an emergency shortcut.

## Severity

- **SEV-1:** signing/refresh/database/S3/admin/CI secret compromise; plaintext
  or private-key exposure; unauthorized production deployment; active account
  takeover; cryptographic integrity failure.
- **SEV-2:** exploitable authorization bypass, prekey/device enumeration,
  suspicious refresh reuse, material log leak, broad provider outage.
- **SEV-3:** contained abuse, failed scanning control, low-scope configuration
  drift with no evidence of access.

SEV-1 requires immediate on-call/security/product/legal coordination.

## First 30 minutes

- Assign incident commander, scribe, operations, and communications owners.
- Record UTC start, detection source, affected environment/commit, and current
  symptoms.
- Freeze deployments and credential changes except those directed by the
  incident commander.
- Preserve Cloudways, database, S3, reverse-proxy, CI, security audit, and
  provider logs in restricted evidence storage.
- Snapshot affected infrastructure when safe; do not destroy the original.
- Disable affected admin/user/device/session/token family.
- If scope is unknown, revoke broadly and prefer temporary unavailability over
  silent plaintext fallback.
- Block malicious origin/IP/account indicators at the edge without treating IP
  alone as identity.

Do not paste tokens, OTPs, phone numbers, coordinates, ciphertext, presigned
URLs, or log bodies into the incident channel.

## Credential compromise playbooks

### JWT signing secret

Rotate both current and previous signing pairs, increment/revoke all sessions,
restart all workers, and require reauthentication. Verify issuer/audience/KID
checks. Search logs for old-KID use after cutover.

### Refresh-token pepper or refresh database

Revoke every refresh family, rotate the pepper, restart, and require
reauthentication. Treat any consumed-token reuse as theft and correlate only
with pseudonymous session/device/IP metadata.

### Database

Disable the credential/network path, preserve evidence, create a new
least-privilege login, rotate every secret stored or derivable from the
database, revoke sessions, and restore/verify into a new database if integrity
is uncertain. Legacy plaintext rows/backups make this a content-breach event.

### S3

Disable the key, block public access, preserve access logs/version inventory,
issue a new prefix-limited key, and verify every object against recorded
ciphertext hashes. Attachment plaintext keys should not exist server-side; if
they are found, escalate as a broken E2EE boundary.

### Admin account

```bash
cd server
npm run admin:manage -- revoke-sessions --login <login>
npm run admin:manage -- deactivate --login <login>
```

Then investigate audit records, rotate related secrets, create a separate
replacement administrator through the CLI, and do not reactivate until cause
and endpoint integrity are established.

### CI or dependency compromise

- Disable workflows/deployment credentials and freeze artifacts.
- Identify the first bad commit/action/package and every workflow run that used
  it.
- Treat all runner-readable secrets as stolen.
- Rotate Cloudways, GitHub, registry, database, S3, APNs, VAPID, SMS/Telegram,
  and signing credentials in dependency order.
- Rebuild from a known-good commit on clean infrastructure with locked
  dependencies and verified action SHAs.
- Compare deployed image digest/SBOM with the approved build.

## E2EE-specific incidents

- Identity-key change without user action: revoke device/session, preserve
  public-key history, show an uncompromisable warning, and require
  reverification.
- Invalid/tampered/replayed envelopes: quarantine metadata and ciphertext as
  restricted evidence, never log decrypted content, block the sender device if
  abuse is confirmed, and inspect membership/idempotency state.
- Client private-key theft: revoke the device for future delivery. Explain that
  already received/local plaintext may be compromised and cannot be remotely
  made unread.
- Protocol/library vulnerability: stop affected client versions, follow
  upstream guidance, rotate/re-establish sessions as required, and obtain
  cryptographic review before resuming.

## Log preservation and cleanup

Old logs are never deleted automatically. First copy them to restricted
evidence/backup storage, checksum and verify the archive, approve retention,
then run the scoped helper:

```bash
cd /home/master/Mobile-Messenger-IOS
RETENTION_DAYS=30 \
  Scripts/archive-and-purge-logs.sh \
  --confirm \
  /secure/log-archives/mobile-messenger-<utc-timestamp>.tar.gz
```

The script refuses relative/in-place archives, does not overwrite, validates
the archive, and deletes only regular files older than the retention value
inside the exact `server/logs` directory. It does not erase provider, database,
backup, or audit-table records.

## Recovery validation

- restore/build artifact is from a reviewed commit;
- production config validator passes;
- migrations and RLS/grants match;
- no default admin or env-admin credential exists;
- revoked sessions/devices remain revoked;
- plaintext sends remain rejected;
- push remains generic;
- storage and database anonymous/public access fail;
- new secrets work and old secrets fail;
- monitoring sees no recurrence for the agreed observation window.

Use [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) and
[SECURITY_DEPLOYMENT.md](./SECURITY_DEPLOYMENT.md).

## Communications and post-incident

Legal/product owners determine notification duties and wording. State what is
known, distinguish content from metadata exposure, and do not claim E2EE where
the client protocol was not active.

Within five business days, publish an internal post-incident review covering
timeline, root cause, affected assets/users/data, detection gaps, control
failures, recovery evidence, owners, deadlines, and recurrence tests. Update
this threat model/runbook and add automated regression coverage.
