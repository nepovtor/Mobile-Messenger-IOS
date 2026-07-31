# Security Deployment Runbook

This is the production gate for Cloudways. A successful build is not permission
to deploy while any release blocker in
[SECURITY_AUDIT.md](./SECURITY_AUDIT.md) remains open.

## 1. Pre-deployment approvals

- Reviewed commit/PR with green backend, web, iOS, migration, secret, and
  container checks. CodeQL and dependency review must also be green when
  GitHub Advanced Security is enabled.
- E2EE protocol gate approved, or the production deployment remains disabled.
- No high/critical production dependency advisory accepted without a dated,
  owned exception.
- Fresh encrypted database and S3 inventories/backups with a successful staging
  restore.
- Rollback artifact/database boundary identified.
- On-call owner and incident channel confirmed.

## 2. Cloudways manual controls

Configure these outside Git:

- TLS certificate and HTTPS redirect; TLS 1.2+ only.
- HSTS after every required subdomain is HTTPS.
- Host firewall exposing only 80/443 and restricted administration access.
- Backend listens on loopback (`127.0.0.1:3001`); reverse proxy is the only
  public entry.
- `/realtime` proxies WebSocket upgrade and preserves the `Origin` header.
- Managed PostgreSQL requires TLS (`sslmode=require`) and a dedicated
  least-privilege application user.
- S3 bucket is private, blocks public ACL/policy, denies non-TLS requests, and
  grants the app only the required object prefix/actions.
- Supabase Data API is disabled when no direct client access is required.
- Cloudways secret/environment values are masked from logs and limited to the
  deployment identity.
- Alerting covers auth/admin failures, refresh reuse, device/prekey abuse,
  rejected envelope authorization, storage failures, and elevated 4xx/5xx.

Do not install or expose pgAdmin on the production host.

## 3. Environment

Start from the tracked template, never from a developer's existing env:

```bash
cd /home/master/Mobile-Messenger-IOS/server
umask 077
cp production.env.example /secure/config/mobile-messenger.production.env
chmod 600 /secure/config/mobile-messenger.production.env
```

Populate it from the secret manager. Required security variables include:

```text
DATABASE_URL
JWT_ACCESS_CURRENT_KEY_ID
JWT_ACCESS_CURRENT_SECRET
JWT_ACCESS_PREVIOUS_KEY_ID
JWT_ACCESS_PREVIOUS_SECRET
JWT_ISSUER
JWT_AUDIENCE
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
OTP_PEPPER
REFRESH_TOKEN_PEPPER
LOG_IP_HASH_KEY
COOKIE_SECURE
COOKIE_SAME_SITE
CORS_ORIGINS
WS_ORIGINS
E2EE_ENABLED
E2EE_REQUIRED
LEGACY_MESSAGES_READ_ENABLED
PASSWORD_LOGIN_ENABLED
ADMIN_IP_ALLOWLIST_ENABLED
ADMIN_IP_ALLOWLIST
S3_ENDPOINT
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET
S3_REGION
S3_TLS_ENABLED
```

Provider variables are required when that provider is enabled. All secrets must
be independent. Production invariants are:

```text
NODE_ENV=production
DB_SYNCHRONIZE=false
E2EE_ENABLED=true
E2EE_REQUIRED=true
AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_TEST_CODE=false
PASSWORD_LOGIN_ENABLED=false
COOKIE_SECURE=true
S3_TLS_ENABLED=true
PUSH_ALLOW_TEST_ENDPOINT=false
```

`CORS_ORIGINS` and `WS_ORIGINS` are explicit comma-separated HTTPS origins;
wildcards are forbidden.

For this private repository, GitHub CodeQL upload and Dependency Review require
GitHub Advanced Security. After enabling it in repository settings, create the
repository variables `CODEQL_ENABLED=true` and
`DEPENDENCY_REVIEW_ENABLED=true`. The workflows remain skipped until both the
feature and their corresponding variables are enabled; backend and web package
audits continue to run unconditionally.

## 4. Build and configuration checks

Use locked dependencies:

```bash
cd /home/master/Mobile-Messenger-IOS
git fetch --prune
git checkout <reviewed-commit>

cd server
npm ci
npm run format:check
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high

cd ../web
npm ci
npm run audit:security
npm run format:check
npm run lint
npm exec -- tsc -b --pretty false
npm test
npm run build
```

Never run `npm audit fix --force` in production. Review and update each
dependency through a normal PR and lockfile.

The web audit has one narrow, expiring exception for
`GHSA-qwww-vcr4-c8h2`: the application is a static SPA and does not enable
React Server Components or server actions, which are the affected mode.
`Scripts/audit-web-dependencies.mjs` rejects every other advisory and expires
the exception on 2026-08-08. Upgrade React Router and remove the exception as
soon as a patched release is published.

Validate Compose without printing its rendered environment:

```bash
cd /home/master/Mobile-Messenger-IOS
Scripts/verify-production-security.sh

cd server
PRODUCTION_ENV_FILE=/secure/config/mobile-messenger.production.env \
  docker compose -f docker-compose.yml config --quiet
```

## 5. Back up and migrate

Follow [BACKUP_RESTORE.md](./BACKUP_RESTORE.md). Record the encrypted backup
object, checksum, database version, application commit, and restore-test result.

Apply migrations with the migration identity and production env:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run migration:show:dist
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run migration:run:dist
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run migration:show:dist
```

Apply the Supabase default-deny migration through the approved Supabase
migration process. Verify:

```sql
select n.nspname, c.relname, c.relrowsecurity
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;
```

Every backend-owned table must report `relrowsecurity = true`. Confirm
`anon`/`authenticated` have no grants. No permissive policy is required because
clients use the NestJS API, not the Data API.

## 6. Provision administrators

There is no environment administrator and no seeded password. After migrations,
run the CLI from a restricted terminal:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run admin:create -- --login <new-login> --generate-password
```

The generated password appears once. Transfer it through the approved
credential channel and require immediate password-manager storage. Never copy it
to an env file. Useful operations:

```bash
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run admin:manage -- show --login <login>
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run admin:manage -- password --login <login>
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run admin:manage -- revoke-sessions --login <login>
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run admin:manage -- deactivate --login <login>
```

## 7. Deploy

Container path:

```bash
cd /home/master/Mobile-Messenger-IOS/server
PRODUCTION_ENV_FILE=/secure/config/mobile-messenger.production.env \
  docker compose -f docker-compose.yml up --detach --build
```

The production Compose file runs as UID/GID 1000, drops capabilities, uses a
read-only root filesystem, creates bounded tmpfs for logs/temp files, binds the
API to loopback, runs migrations before startup, and has a healthcheck.

PM2 installations may instead follow
[cloudways-pm2-run.md](./cloudways-pm2-run.md), but must use the same env and
preflight gates.

## 8. Post-deployment checks

- `GET /api/health` and `/api/version` work internally and through HTTPS.
- HTTP redirects to HTTPS and expected security headers are present.
- An unlisted CORS/WS origin is rejected.
- WebSocket query-token authentication is rejected.
- A plaintext send is rejected while `E2EE_REQUIRED=true`.
- Push payload contains only a generic availability event/body.
- A revoked user/admin session and revoked device cannot reconnect/receive.
- Anonymous Supabase reads fail.
- S3 anonymous listing/read and non-TLS access fail.
- Logs contain request IDs/routes/status/duration, not tokens, OTP, phones,
  bodies, ciphertext, coordinates, or presigned URLs.

Watch error/security metrics for at least one full access-token TTL before
closing the change.

## 9. Rollback

Application rollback is allowed only while the deployed schema remains
compatible. Do not disable E2EE or re-enable plaintext to make an old binary
work.

1. Stop new writes if schema compatibility is uncertain.
2. Preserve logs/audit records and take a new database snapshot.
3. Roll back to the reviewed image/commit.
4. Revert only the last migration when its `down` path was tested and no new
   opaque data would be lost.
5. Otherwise restore the pre-deployment backup into a new database and switch
   after validation.
6. Rotate secrets if rollback followed a suspected compromise.

Document the incident/change and reconcile writes before reopening traffic.
