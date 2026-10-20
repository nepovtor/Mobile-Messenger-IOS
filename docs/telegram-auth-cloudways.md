# Telegram Auth on Cloudways

This guide covers the checked-in Telegram integration and configured Cloudways
addresses. It does not certify the live deployment or authorize a production
release. Follow [SECURITY_DEPLOYMENT.md](./SECURITY_DEPLOYMENT.md) first;
production messaging remains blocked by the
[E2EE decision gate](./E2EE_ARCHITECTURE.md).

Configured endpoints:

- [Backend health](https://phpstack-1634854-6489525.cloudwaysapps.com/api/health)
- [Backend version](https://phpstack-1634854-6489525.cloudwaysapps.com/api/version)
- REST base: `https://phpstack-1634854-6489525.cloudwaysapps.com/api`
- Realtime: `wss://phpstack-1634854-6489525.cloudwaysapps.com/realtime`

## Configuration

Populate a protected env file outside the checkout from
[server/production.env.example](../server/production.env.example). The deployment
runbooks use `/secure/config/mobile-messenger.production.env`. Configure the
full database, JWT key rotation, independent hashing secrets, cookies, HTTPS
origins, private storage, and administrator allowlist settings there.

Apply the Telegram provider settings in
[TELEGRAM_AUTH.md](./TELEGRAM_AUTH.md#bot-and-environment), supplying the real
bot token and username through the secret store. Keep demo accounts, password
login, and fixed test codes disabled. Use `JWT_ACCESS_EXPIRES_IN=10m` and the
current/previous `JWT_ACCESS_*` keys; the old `JWT_SECRET`/`JWT_SECRET_KEY`
configuration and seven-day access tokens do not satisfy production validation.

`WEB_APP_URL` is the browser application URL used for Telegram subscription
mini-app links. It does not replace the bot token/username or origin allowlists.
`PUBLIC_WEB_URL` is a legacy fallback for that URL.

Keep `E2EE_ENABLED=true` and `E2EE_REQUIRED=true`. A working verification
provider does not make the legacy clients capable of production encrypted
messaging.

## Configuration validation and process restart

After the reviewed build exists, validate without displaying secrets:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  node --require dotenv/config \
  --eval 'require("./dist/modules/common/runtime-config.js").validateRuntimeConfig()'
```

The validator checks the shared security configuration; a successful result
does not test Telegram credentials or delivery. Complete release, backup,
migration, and network checks before restarting. Use the container procedure in
[SECURITY_DEPLOYMENT.md](./SECURITY_DEPLOYMENT.md), or the documented
[PM2 procedure](./cloudways-pm2-run.md#6-start-or-reload-pm2) when applicable.

Do not rely on the legacy PM2 ecosystem file's `.env` path. When reloading an
existing approved PM2 installation, supply the protected env path:

```bash
cd /home/master/Mobile-Messenger-IOS/server
DOTENV_CONFIG_PATH=/secure/config/mobile-messenger.production.env \
  NODE_ENV=production \
  pm2 reload messenger-backend --update-env
pm2 save
```

## Health and pairing checks

Health/version endpoints can be checked without credentials:

```bash
curl --fail --silent --show-error \
  https://phpstack-1634854-6489525.cloudwaysapps.com/api/health
curl --fail --silent --show-error \
  https://phpstack-1634854-6489525.cloudwaysapps.com/api/version
```

For pairing, use a phone number you control and a persistent device identifier.
The `cli` platform header is required by production auth context validation;
native iOS requests instead use `ios` and must include `X-Device-ID`.

```bash
curl --fail-with-body --silent --show-error \
  -X POST \
  https://phpstack-1634854-6489525.cloudwaysapps.com/api/auth/telegram/pairing \
  -H 'Content-Type: application/json' \
  -H 'X-Client-Platform: cli' \
  -H 'X-Device-ID: telegram-manual-check' \
  -d '{"phone":"<your-international-phone>"}'
```

Replace the phone placeholder before running. A successful response contains
`botUsername`, `telegramStartUrl`, and `expiresIn` (600 seconds with the template
settings). Treat the returned URL as a temporary secret and do not paste it into
issues or shared logs. A URL confirms local configuration, not bot token validity.

Common failure cases:

- `400`: invalid phone or missing/invalid client context.
- `429`: pairing cooldown or rate limit.
- `503 Telegram pairing unavailable`: missing token or username.
- Pairing URL works but contact linking does not: verify
  `VERIFICATION_PROVIDER=telegram`, the bot identity, and polling health.
- Conflicting pollers: ensure only one backend instance consumes `getUpdates`
  for the token.
- Token rotated or invalid: update it through the protected environment and
  reload the process. Do not place real tokens in shell command URLs/history.

## Complete login verification

1. Open the returned Telegram URL and share your own contact using the bot's
   button.
2. Request a code from the client and confirm that it arrives in Telegram.
3. Verify the code and confirm `GET /api/auth/me` succeeds in that session.
4. Verify session refresh and logout through the client.

An unlinked phone receives a generic `code_sent` response to avoid disclosing
link state; it receives no usable challenge. Browser clients use HttpOnly
cookies, while iOS/CLI receive access and refresh material. Keep tokens, OTPs,
pairing URLs, raw provider logs, env files, and credentials outside Git.
