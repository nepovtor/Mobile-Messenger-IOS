# Security Audit

Audit date: 2026-07-31
Branch: `security/e2ee-hardening`

## Executive result

The review found critical authentication, plaintext-content, secret-management,
storage, logging, authorization, and deployment weaknesses. This branch adds
fail-closed production configuration, session/device and opaque-delivery
schema, administrator CLI provisioning, safer transport/logging/client token
handling, default-deny Supabase access, migration tests, and CI security gates.

Production E2EE is **not complete**. Client cryptography is blocked by the
library/support/license decision in
[E2EE_ARCHITECTURE.md](./E2EE_ARCHITECTURE.md). The server boundary must stay
`E2EE_REQUIRED=true`; do not relabel the existing legacy plaintext experience
as E2EE.

## Findings

| Severity | Finding | Disposition |
| --- | --- | --- |
| Critical | Initial migration and runtime fallback created `admin/admin`. | Seed/fallback removed. Administrators are database-managed and provisioned with `npm run admin:create`; Argon2id and audit events are required. |
| Critical | An ignored local production env file contains real-looking database, JWT, and admin credentials. | Never committed by this branch. Treat exposed values as compromised and rotate them before any deployment. |
| Critical | Public `POST /api/users` could create an account for an unverified phone number. | Production registration is restricted to the OTP flow; legacy password registration is feature-gated off. |
| Critical | Message text, previews, precise coordinates, and attachment metadata were available to the server/admin/log/push paths. | New production boundary rejects plaintext and uses opaque envelopes/generic push. Existing rows remain `legacy` pending the migration plan. |
| Critical | JWTs lived in browser `localStorage` and WebSocket query strings. | Web session transport moves to Secure/HttpOnly/SameSite cookies; query-token auth is rejected. iOS retains Keychain-backed bearer transport. |
| High | Long-lived nonrotating JWTs shared one secret and had no server session/reuse detection. | Short access JWTs, current/previous KIDs, rotating hashed refresh tokens, family revocation, device/session IDs, and status/version checks added. |
| High | OTP hashing reused JWT secret; consume was non-atomic; logs/provider could disclose OTP. | Independent pepper, atomic consume, generic responses, bounded attempts, redaction, and IP/phone/device rate dimensions required. |
| High | Request/error logs captured raw URL, query/body, IP, and content. | Central recursive redaction and route-only structured request logs added. Old logs are retained until explicit reviewed cleanup. |
| High | Contact ownership alone granted precise-location visibility. | Accepted request plus explicit per-contact location grant/expiry/revoke is required; exact location belongs in E2EE payloads. |
| High | S3 fell back to `minioadmin`, could create buckets, and trusted client MIME. | Production validates endpoint/TLS/credentials/bucket/region and fails closed; ciphertext attachment records minimize server-visible metadata. |
| High | WebSocket allowed query JWT and lacked strict origin/session/device controls. | Query JWTs are rejected; origin, active session/principal/device, per-user/per-IP connections, per-event rate, runtime payload size/shape, session revalidation, and heartbeat controls are enforced. |
| High | Supabase public tables had no RLS or explicit grant boundary. | RLS enabled and `anon`/`authenticated` privileges revoked for every backend-owned table; Data API should also be disabled manually. |
| High | Production Compose published PostgreSQL/pgAdmin with fallback credentials. | Production Compose contains only the loopback-bound backend and expects managed TLS database/storage. No DB/admin ports or fallback credentials. |
| High | `apn@2.2.0`, Nest 10, and stale build tooling carried known advisories. | APNs now uses native HTTP/2/ES256; `apn` was removed, Nest/tooling were updated, and the complete backend audit is clean. The web audit has one temporary, expiring RSC-only React Router exception for a mode this SPA does not use. |
| Medium | Admin/system UI exposed JWT/debug/log/database detail. | Content/detail is minimized; admin must never expose plaintext message fields or raw logs. |
| Medium | CI lacked real PostgreSQL migration, secret, dependency, SAST, and container gates. | Clean plus legacy up/down/up migration tests, Gitleaks, dependency review, CodeQL, audits, production invariants, and Trivy image scan added. |
| Medium | No operational key rotation, restore, or incident runbooks. | Added under `docs/` and linked from the root README. |

## Verification

Run from the repository root:

```bash
Scripts/verify-production-security.sh

cd server
npm run format:check
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high

cd ../web
npm run audit:security
npm run format:check
npm run lint
npm exec -- tsc -b --pretty false
npm test
npm run build
```

With a disposable PostgreSQL 16 instance:

```bash
Scripts/migration-smoke.sh
```

CI additionally builds/tests iOS, lints the Supabase schema, reviews dependency
changes, scans Git history for secrets, runs CodeQL, and scans the production
container for critical vulnerabilities.

## Open release blockers

- Select and legally approve a reviewed cross-platform E2EE implementation.
- Complete official vectors and iOS/web interoperability tests.
- Upgrade React Router and remove the narrow `GHSA-qwww-vcr4-c8h2` exception
  as soon as a patched release is published; the exception expires 2026-08-08.
- Rotate every value from the ignored local production env and revoke old
  sessions/tokens.
- Complete a staging backup/restore drill and legacy-message inventory.
- Configure Cloudways TLS, firewall, secret injection, monitoring, and rollback.
- Disable the Supabase Data API for backend-owned tables/project if it is not
  used.
- Obtain an external cryptographic and deployment review before claiming E2EE.

## Audit limitations

This was a source/configuration review and local automated verification, not a
formal penetration test, cryptographic audit, Cloudways account audit, mobile
binary assessment, or review of third-party provider consoles. No production
secret was intentionally used to test external services.
