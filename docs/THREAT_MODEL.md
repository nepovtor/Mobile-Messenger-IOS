# Threat Model

Review date: 2026-07-31
Scope: iOS app, web app, NestJS API, WebSocket transport, PostgreSQL,
S3-compatible storage, push providers, Telegram/SMS verification, CI/CD, and
Cloudways operations.

## Security objectives

- Only an active participant and intended active device can receive an
  encrypted envelope for a chat.
- The service cannot derive message or attachment plaintext once E2EE is
  activated.
- Authentication, device, contact, location-permission, and administrator
  changes are auditable and revocable.
- A database or object-storage disclosure reveals ciphertext and unavoidable
  metadata, not content keys.
- Production fails closed when secrets, TLS, CORS, storage, migration, or E2EE
  requirements are absent.

## Trust boundaries and assets

| Boundary | Sensitive assets |
| --- | --- |
| iOS device | session tokens, identity private key, ratchet state, local plaintext |
| Browser | session cookie, unlocked key state, rendered plaintext, downloaded JavaScript |
| API/WebSocket | authorization context, rate-limit state, opaque envelopes, metadata |
| PostgreSQL | account/contact/device/session records, public prekeys, ciphertext metadata, legacy plaintext during migration |
| S3 | encrypted blobs and technical object keys |
| Push/SMS/Telegram | routing identifiers and generic notification/auth delivery |
| CI/Cloudways | deployment identity, database/storage/provider secrets, signing material |

The API process, database administrator, storage administrator, and Cloudways
operator are trusted for availability and metadata integrity. They are not
trusted with message content in the target E2EE model.

## Adversaries

- unauthenticated remote attacker;
- authenticated malicious user or removed group participant;
- stolen refresh token or stolen/revoked device;
- network observer or hostile Wi-Fi;
- compromised database, backup, storage bucket, or administrator account;
- malicious/compromised dependency or CI runner;
- operator attempting to inspect content;
- XSS attacker controlling the web origin;
- malware controlling an unlocked endpoint.

Denial of service by a sufficiently capable infrastructure provider and
traffic-analysis resistance are not full objectives.

## Threats and controls

| Threat | Controls | Residual risk / status |
| --- | --- | --- |
| Database compromise | least-privilege DB role, RLS and revoked Data API roles, hashed refresh/OTP material, opaque envelopes, encrypted backups | Legacy `messages.text` remains sensitive until its approved retirement. |
| Dishonest administrator | no message content in admin API/logs/push; server has no private keys in target design; audited admin/session changes | Operator still sees membership, timing, sizes, IP hashes, and can deny/modify traffic. Client authentication detects ciphertext modification only after protocol integration. |
| Traffic interception | TLS 1.2+ at edge, secure cookies, strict origins, WSS, authenticated ciphertext | E2EE does not replace TLS. TLS termination and DNS remain operational trust points. |
| Ciphertext substitution | protocol AEAD/signature verification, sender/device binding, membership epoch | Blocked until a reviewed client protocol is integrated. |
| Replay or duplicate delivery | protocol replay window, one-time-prekey claim, unique idempotency keys, per-device envelope uniqueness | Server idempotency cannot replace cryptographic replay protection. |
| Stolen device | Keychain device-only accessibility, short access token, rotating refresh family, session/device revoke | Malware or an unlocked stolen device can read displayed/local messages. |
| Identity-key change | explicit warning, fingerprint/QR, verified state, no silent re-trust | UX and protocol integration remain blocked. |
| Malicious participant | chat authorization, per-device fan-out, group epoch rotation, block state | A legitimate recipient can copy plaintext or take screenshots. |
| Removed group member | membership check before envelope acceptance, protocol group rekey | Correct cryptographic exclusion depends on selected group protocol. |
| Web supply-chain/XSS | CSP, no token in localStorage/URL, lockfiles, audits, CodeQL, dependency review, secret scan | The server supplies JavaScript that can access an unlocked session; a compromised web deployment defeats endpoint E2EE. |
| OTP abuse/account enumeration | hashed OTP, separate pepper, atomic single use, generic responses, IP/phone/device limits | SMS/Telegram providers still observe destination metadata and can be abused operationally. |
| Push disclosure | generic `message.available` / “Новое сообщение” only | Provider sees device token, timing, and app identity. |
| Location stalking | accepted contact plus per-contact grant/expiry/revoke; exact coordinates only as E2EE payload | Legacy server location rows must be disabled and removed after migration. |
| Attachment abuse | ciphertext size/hash/ownership/expiry checks and private bucket | Server cannot malware-scan encrypted plaintext; recipients must treat decoded files as untrusted. |
| Backup theft | encrypted, access-controlled, immutable backups with restore tests | Backup keys and legacy backups remain high-value secrets. |

## Abuse cases

- A user requests every prekey bundle: enforce authentication, target/member
  authorization, per-user/device/IP limits, and alert on enumeration patterns.
- A sender submits an envelope for a nonparticipant or revoked device: reject
  the whole atomic request and audit identifiers only.
- A sender omits a recipient device: the server compares the envelope set with
  the active-device set for the authorized membership epoch.
- A client reuses an idempotency key with different bytes: return conflict;
  never silently accept the replacement.
- A blocked contact requests location: deny regardless of an older location
  grant.
- An administrator reuses a refresh token: revoke its full family and require
  reauthentication.

## Metadata still visible

E2EE does not hide:

- user, device, chat, and membership identifiers;
- sender/recipient device routing;
- send/receive/delivery timestamps;
- ciphertext and attachment sizes;
- IP-derived technical data and user-agent hashes;
- connection timing and frequency;
- push provider routing;
- the fact that a location-type envelope or attachment exists if the outer
  message type is not padded/hidden.

Documentation and product UI must not claim metadata anonymity.

## Explicit limitations

- Malware or an attacker controlling an unlocked endpoint can read messages.
- The web client depends on the integrity of JavaScript served for every load.
- Losing private keys may permanently lose message history.
- A recipient can redistribute plaintext.
- E2EE does not hide all metadata and does not replace TLS, authentication,
  authorization, rate limiting, backups, or incident response.
- Availability against the hosting provider is not guaranteed.

## Reassessment triggers

Review this model before changing the protocol/library, web hosting origin,
authentication provider, push payload, group model, backup provider, database
role, S3 policy, or CI third-party action. Reassess immediately after an
identity-key, supply-chain, database, storage, or signing-key incident.
