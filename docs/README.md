# Documentation

Start with the [project README](../README.md) for implemented features, local setup, and verification commands. These guides describe the checked-in code and release requirements; they do not confirm a live deployment or completed release.

## Setup and operations

| Guide | Purpose |
| --- | --- |
| [Web client](../web/README.md) | Browser routes, local setup, environment variables, hosting, and limitations |
| [SMS authentication](REAL_SMS_AUTH.md) | Verification providers, local test mode, and production configuration |
| [Telegram authentication](TELEGRAM_AUTH.md) | Pairing, own-contact linking, OTP login, and provider settings |
| [Telegram on Cloudways](telegram-auth-cloudways.md) | Cloudways configuration and troubleshooting |
| [Security deployment](SECURITY_DEPLOYMENT.md) | Production release gates, secrets, migrations, validation, and rollback |
| [Cloudways PM2](cloudways-pm2-run.md) | Alternative backend process-management runbook |
| [Backup and restore](BACKUP_RESTORE.md) | Database/storage backup and recovery procedure |
| [Incident response](INCIDENT_RESPONSE.md) | Containment, revocation, logging, and retention procedures |
| [App Store release checklist](../AppStoreReleaseChecklist.md) | Native app configuration, signing, APNs, device QA, and submission |
| [Screenshot inventory](screenshots/README.md) | Existing captures and views still needed |

## Security design and status

**Client E2EE is not implemented.** The production configuration requires E2EE and rejects plaintext messaging. Opaque server records do not complete the client protocol, interoperability, identity verification, or cryptographic review gates.

| Document | How to use it |
| --- | --- |
| [E2EE architecture and integration gate](E2EE_ARCHITECTURE.md) | Target design and required exit criteria; dependency decision is historical |
| [October 1, 2026 reassessment](E2EE_REASSESSMENT_2026-10-01.md) | Latest checked-in dated reassessment and its verification limits |
| [Security audit](SECURITY_AUDIT.md) | Recorded findings and release blockers; not a fresh independent audit |
| [Threat model](THREAT_MODEL.md) | Trust boundaries, threats, and required controls |
| [Key management](KEY_MANAGEMENT.md) | Identity/session key storage and lifecycle plan |
| [Legacy migration](MIGRATION_TO_E2EE.md) | Migration boundaries and handling of historical plaintext |

Dated audits and test counts record the review described in each document. They must not be presented as the result of a later documentation update. Check the current [GitHub Actions results](https://github.com/nepovtor/Mobile-Messenger-IOS/actions) for automated verification.

## Configuration sources

- [Backend local example](../server/.env.example)
- [Backend production example](../server/production.env.example)
- [Development Compose](../server/docker-compose.dev.yml)
- [Production Compose](../server/docker-compose.yml)
- [iOS Debug configuration](../MobileMessengerIOS/Configurations/Debug.xcconfig)
- [iOS Release configuration](../MobileMessengerIOS/Configurations/Release.xcconfig)
- [REST contract](../contracts/openapi.json)

Use placeholder templates to prepare a local or protected environment. Keep populated environment files and credentials outside Git.
