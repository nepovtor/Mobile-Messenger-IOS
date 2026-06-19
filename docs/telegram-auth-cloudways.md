# Telegram Auth On Cloudways

Current backend:

- Base URL: `https://phpstack-1634854-6489525.cloudwaysapps.com`
- Health: `https://phpstack-1634854-6489525.cloudwaysapps.com/api/health`
- Version: `https://phpstack-1634854-6489525.cloudwaysapps.com/api/version`
- Realtime: `wss://phpstack-1634854-6489525.cloudwaysapps.com/realtime`

## What the current code expects

Telegram login in this project uses:

1. `POST /api/auth/telegram/pairing`
2. `POST /api/auth/request`
3. `POST /api/auth/verify`
4. `GET /api/auth/me`

Normal flow:

1. User enters a phone number in Web or iOS.
2. Backend creates a short-lived pairing token.
3. Client opens `https://t.me/<bot_username>?start=<pairing-token>`.
4. User sends their own contact with the Telegram contact button.
5. Backend links Telegram account to the phone number.
6. User requests a login code.
7. Backend delivers the code through Telegram.
8. User verifies the code and receives a JWT.

## Required production env for Telegram auth

Use this Cloudways template without real secrets:

```env
VERIFICATION_PROVIDER=telegram
# Current code does not define SMS_PROVIDER=telegram.
# When VERIFICATION_PROVIDER=telegram, SMS_PROVIDER is ignored for code delivery.
SMS_PROVIDER=console

TELEGRAM_BOT_TOKEN=PASTE_REAL_BOT_TOKEN
TELEGRAM_BOT_USERNAME=PASTE_REAL_BOT_USERNAME_WITHOUT_AT
TELEGRAM_ALLOW_TEXT_PHONE_LINKING=false
TELEGRAM_REQUIRE_OWN_CONTACT=true
TELEGRAM_PAIRING_TOKEN_TTL_SECONDS=600
TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS=60
TELEGRAM_ALLOW_RELINK=false

AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_TEST_CODE=false
AUTH_ALLOW_PASSWORD_LOGIN=false
AUTH_CODE_TTL_SECONDS=300
AUTH_CODE_MAX_ATTEMPTS=5
AUTH_CODE_RESEND_COOLDOWN_SECONDS=60
```

Also keep the usual production auth settings already required by the app:

- `NODE_ENV=production`
- `JWT_SECRET_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`

Optional:

- `WEB_APP_URL` or `PUBLIC_WEB_URL` only if you also want the Telegram subscription mini app flow.

Do not commit `.env` or any real bot token to GitHub.

## Why pairing returns 503

`POST /api/auth/telegram/pairing` returns `503 Telegram pairing unavailable` only when one of these is true:

- `TELEGRAM_BOT_TOKEN` is missing
- `TELEGRAM_BOT_USERNAME` is missing or empty

Important related pitfalls:

- If `VERIFICATION_PROVIDER` is not `telegram`, the bot will ignore the contact-linking flow even if pairing returns a URL.
- If the bot token is present but invalid, pairing can still return `200`, but Telegram polling and code delivery will fail.
- If another server instance uses the same bot token with `getUpdates`, Cloudways logs will show a `409` polling conflict and updates will stop on this instance.

## BotFather checklist

How to verify or restore an old bot:

1. Open Telegram and message `@BotFather`.
2. Run `/mybots` and select the existing bot.
3. Check the bot username there.
4. If you need a new token, use `API Token` or reset/regenerate the token in BotFather.
5. Update Cloudways `.env` with the new token and restart PM2 immediately.

Username format:

- Recommended: `your_bot_username` without `@`
- Current code strips a leading `@`, so `@your_bot_username` also normalizes correctly, but storing it without `@` is cleaner.

Token format:

- Use the exact BotFather token string
- Do not wrap it in quotes unless your shell or panel requires that explicitly

How to check that the token works:

```bash
/usr/bin/curl -sS "https://api.telegram.org/bot<PASTE_REAL_BOT_TOKEN>/getMe"
```

Successful result:

- HTTP `200`
- JSON with `"ok": true`
- `result.username` matches `TELEGRAM_BOT_USERNAME`

If the token was reset:

1. Replace `TELEGRAM_BOT_TOKEN` on Cloudways.
2. Keep `TELEGRAM_BOT_USERNAME` pointed to the same bot username.
3. Restart PM2 with `--update-env`.
4. Re-test pairing and login.

## Cloudways restart and checks

After editing `/home/master/Mobile-Messenger-IOS/server/.env`:

```bash
cd /home/master/Mobile-Messenger-IOS/server
pm2 restart messenger-backend --update-env
pm2 save
pm2 logs messenger-backend --lines 100
```

Health checks:

```bash
/usr/bin/curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/health
/usr/bin/curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/version
```

Pairing check:

```bash
/usr/bin/curl -i -X POST https://phpstack-1634854-6489525.cloudwaysapps.com/api/auth/telegram/pairing \
  -H "Content-Type: application/json" \
  -d '{"phone":"+375291234567"}'
```

Successful pairing response:

- HTTP `200`
- JSON like:

```json
{
  "botUsername": "your_bot_username",
  "telegramStartUrl": "https://t.me/your_bot_username?start=<short-lived-token>",
  "expiresIn": 600
}
```

Unsuccessful pairing responses:

- `503` means bot token or username is still not configured
- `429` means pairing cooldown or rate-limit was hit
- `400` means phone format is invalid

## Full login verification after env is fixed

1. Open Web or iOS.
2. Enter a real phone number.
3. Trigger Telegram pairing.
4. Open the bot from the returned `telegramStartUrl`.
5. Send your own contact using the Telegram button.
6. Return to the app and request a code.
7. Receive the code in Telegram.
8. Verify the code.
9. Confirm `/api/auth/me` returns the current user with the new bearer token.

Safe manual checks after a real login:

```bash
/usr/bin/curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/auth/me \
  -H "Authorization: Bearer <USER_TOKEN>"

/usr/bin/curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/contacts \
  -H "Authorization: Bearer <USER_TOKEN>"

/usr/bin/curl -i https://phpstack-1634854-6489525.cloudwaysapps.com/api/chats \
  -H "Authorization: Bearer <USER_TOKEN>"
```

## What not to commit

Never commit:

- `.env`
- `TELEGRAM_BOT_TOKEN`
- JWT secrets
- database credentials
- admin passwords
