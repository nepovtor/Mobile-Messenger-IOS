# Key and Secret Management

## Principles

- Generate secrets with an operating-system CSPRNG or managed secret service.
- Use one purpose per secret; never reuse JWT, OTP, refresh-token, log-hash,
  database, S3, push, or provider credentials.
- Keep secrets out of Git, Docker images, build arguments, screenshots, tickets,
  chat, analytics, and command history.
- Inject production values through the Cloudways secret/environment facility or
  a `0600` env file outside the release directory.
- Record owner, creation time, purpose, scope, expiry, and last rotation in the
  organization's secret inventory, never in this repository.

Generate a 256-bit random value without printing it into CI logs:

```bash
openssl rand -hex 32
```

Store the output directly in the secret manager. Do not paste real values into
`server/production.env.example`.

## Server secret inventory

| Purpose | Variables | Rotation effect |
| --- | --- | --- |
| Access JWT signing | `JWT_ACCESS_CURRENT_KEY_ID`, `JWT_ACCESS_CURRENT_SECRET`, `JWT_ACCESS_PREVIOUS_KEY_ID`, `JWT_ACCESS_PREVIOUS_SECRET` | Access tokens expire in at most 15 minutes; two KIDs permit overlap. |
| Refresh token hashing | `REFRESH_TOKEN_PEPPER` | Requires revoking all refresh families when changed. |
| OTP hashing | `OTP_PEPPER` | Invalidates outstanding OTP challenges. |
| IP pseudonymization | `LOG_IP_HASH_KEY` | Changes correlation values; retain old key only if incident analysis explicitly requires it. |
| Database | `DATABASE_URL` | Rotate DB user/password and restart workers; prefer a dedicated non-owner app role. |
| Object storage | `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Overlap keys briefly, test, then disable old key. |
| Web Push | `WEB_PUSH_VAPID_PRIVATE_KEY` | Existing subscriptions may need to subscribe again after replacement. |
| APNs | `APNS_PRIVATE_KEY`, key/team IDs | Upload/activate replacement, test both environments, then revoke old key in Apple portal. |
| Telegram/SMS | provider token/key/secret variables | Rotate in provider console, update secret store, restart, revoke old. |

JWT issuer, audience, KID, endpoint, bucket, and region are configuration rather
than secrets, but unauthorized modification can redirect or weaken trust and
must use the same change-control process.

## JWT signing-key rotation

1. Inventory the current KID/secret and confirm access TTL is at most `15m`.
2. Generate a new independent secret and new unique KID.
3. Deploy with the old current pair moved to `PREVIOUS` and the new pair in
   `CURRENT`.
4. Confirm newly issued JWT headers carry the new KID and both generations
   validate only for the configured issuer/audience.
5. Wait at least the maximum access-token TTL plus clock-skew allowance.
6. Generate a new placeholder previous pair or follow the application's
   validated two-key process; never copy the current secret into both slots.
7. Remove the retired key from the secret manager after audit evidence is
   retained.

For suspected signing-key theft, skip graceful overlap: rotate current and
previous keys together, increment/revoke all sessions, and require
reauthentication.

## Refresh-token pepper rotation

Refresh token material is stored only as a keyed hash. Changing the pepper
makes every stored token unverifiable:

1. revoke all user and admin session families in a transaction;
2. generate and deploy a new pepper;
3. restart every API/realtime worker;
4. require full reauthentication;
5. watch refresh-reuse and login alerts.

Do not support multiple refresh peppers unless a reviewed migration genuinely
requires it; overlap increases the theft window.

## OTP and log-hash key rotation

Before changing `OTP_PEPPER`, expire/consume all outstanding challenges. Rotate
during a low-traffic window and monitor provider delivery and verification
failure rates.

Changing `LOG_IP_HASH_KEY` intentionally breaks stable pseudonymous
correlation. For routine rotation, record the boundary time. During an active
incident, preserve relevant logs and the old key in restricted evidence storage
before rotation.

## Database and S3 rotation

Use separate application credentials with only required database/schema and
bucket/prefix permissions.

Database:

1. create a new least-privilege login;
2. grant only required schema/table/sequence rights;
3. verify migrations with a separately controlled migration identity;
4. update `DATABASE_URL`, restart, and confirm health;
5. terminate old sessions and drop/disable the old login.

S3:

1. create a new key with access only to the private production bucket/prefix;
2. deploy new credentials and test ciphertext upload/download/delete;
3. confirm public listing and anonymous object reads fail;
4. disable then delete the old key;
5. inspect provider access logs for use of the retired key.

## Client E2EE keys

This section becomes active only after the protocol gate in
[E2EE_ARCHITECTURE.md](./E2EE_ARCHITECTURE.md) is approved.

- Identity private keys and ratchet state are device-local and never backed up
  to the application server.
- iOS stores them with
  `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- Web uses the selected library's encrypted persistent store; never
  `localStorage`.
- Attachment content keys/nonces exist only on sender/recipient devices and
  travel only inside an E2EE message.
- Device revocation stops future envelopes but cannot erase plaintext already
  read or copied.
- Recovery/key backup, if offered, must itself be end-to-end encrypted with a
  user-held recovery secret and separately reviewed.

## Compromise rule

If a real secret appears in a terminal transcript, CI log, issue, chat,
screenshot, source file, or tool output, treat it as compromised. Deleting the
text is not remediation: rotate/revoke the credential, invalidate dependent
sessions, preserve evidence, and follow
[INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).
