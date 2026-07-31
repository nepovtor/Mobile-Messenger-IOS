# Cloudways PM2 Runbook

Use this only when the container deployment in
[SECURITY_DEPLOYMENT.md](./SECURITY_DEPLOYMENT.md) is unavailable. The same
release, secret, migration, firewall, TLS, and rollback gates still apply.

Project:

```text
/home/master/Mobile-Messenger-IOS
```

Production env (outside Git):

```text
/secure/config/mobile-messenger.production.env
```

There are no `ADMIN_LOGIN`/`ADMIN_PASSWORD` environment credentials and no
seeded administrator. Provision administrators only through the audited CLI.

## 1. Deploy reviewed code

```bash
cd /home/master/Mobile-Messenger-IOS
git fetch --prune
git checkout <reviewed-commit>
Scripts/verify-production-security.sh
```

Do not deploy a moving branch head or use `git pull` without reviewing the
resulting commit.

## 2. Install, test, and build

```bash
cd /home/master/Mobile-Messenger-IOS/server
npm ci
npm run format:check
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Do not use `npm install`, `npm audit fix --force`, or an uncommitted lockfile on
the production host.

## 3. Validate configuration without printing secrets

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  node --require dotenv/config \
  --eval 'require("./dist/modules/common/runtime-config.js").validateRuntimeConfig()'
```

Never `cat`, `grep`, or enable shell tracing on the production env. The
validator reports missing variable names, not values.

## 4. Backup and migrate

Complete [BACKUP_RESTORE.md](./BACKUP_RESTORE.md), then:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run migration:show:dist
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run migration:run:dist
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run migration:show:dist
```

Stop if the migration state is unexpected. Do not run `synchronize` in
production.

## 5. Create the first administrator

Only when no active administrator exists:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  npm run admin:create -- --login <login> --generate-password
```

The generated password is shown once. Transfer it through the approved
credential channel; never add it to env or deployment scripts.

## 6. Start or reload PM2

The checked-in legacy PM2 ecosystem file may contain stale dotenv settings, so
start the reviewed binary directly with the protected env path:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  NODE_ENV=production \
  pm2 start dist/main.js \
  --name messenger-backend \
  --time \
  --update-env
pm2 save
```

For a zero-downtime reload after the process exists:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  NODE_ENV=production \
  pm2 reload messenger-backend --update-env
pm2 save
```

## 7. Verify

```bash
pm2 status
ss -ltnp | grep '127.0.0.1:3001'
curl --fail --silent http://127.0.0.1:3001/api/health
curl --fail --silent https://phpstack-1634854-6489525.cloudwaysapps.com/api/health
```

Also execute every post-deployment control in
[SECURITY_DEPLOYMENT.md](./SECURITY_DEPLOYMENT.md), including rejected
plaintext, unlisted Origin, query token, anonymous DB/S3, revoked session/device,
generic push, and log-redaction checks.

## 8. Logs

Use request IDs, status codes, event types, and pseudonymous principal/session
IDs. Do not paste raw log files into tickets/chat:

```bash
pm2 logs messenger-backend --lines 100
```

For reviewed archive/retention cleanup, use the scoped command in
[INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

## 9. Reboot and rollback

```bash
pm2 startup
pm2 save
```

If Cloudways restricts startup registration, use its supported service manager;
do not escalate around the platform controls.

Rollback follows the database compatibility rules in
[SECURITY_DEPLOYMENT.md](./SECURITY_DEPLOYMENT.md). Never restore plaintext
writes or a default administrator to recover availability.
