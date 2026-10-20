# Telegram Auth

The backend implements phone verification through a Telegram bot. A user first
pairs their phone with their own Telegram contact, then receives a login code
through the bot. This is authentication, not end-to-end message encryption.
Production messaging remains blocked by the
[E2EE decision gate](./E2EE_ARCHITECTURE.md).

## Bot and environment

Create or select a bot through Telegram's `@BotFather`, then store its token in
the protected environment. Keep the bot username without the leading `@`.

Start with [server/.env.example](../server/.env.example) locally. For production,
use the complete [production template](../server/production.env.example) and
[security deployment runbook](./SECURITY_DEPLOYMENT.md). Apply these Telegram
settings after configuring the required database, session, storage, and origin
settings:

```env
VERIFICATION_PROVIDER=telegram
AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_TEST_CODE=false
PASSWORD_LOGIN_ENABLED=false
AUTH_CODE_TTL_SECONDS=300
AUTH_CODE_MAX_ATTEMPTS=5
AUTH_CODE_RESEND_COOLDOWN_SECONDS=60
TELEGRAM_ALLOW_TEXT_PHONE_LINKING=false
TELEGRAM_REQUIRE_OWN_CONTACT=true
TELEGRAM_PAIRING_TOKEN_TTL_SECONDS=600
TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS=60
TELEGRAM_ALLOW_RELINK=false
```

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` separately through the
secret store or ignored local env file. `SMS_PROVIDER` is not used for code
delivery when `VERIFICATION_PROVIDER=telegram`.

Production requires the current/previous `JWT_ACCESS_*` key configuration,
independent OTP/refresh/log secrets, and short-lived access tokens from the
production template. Legacy `JWT_SECRET` and seven-day access tokens are not a
valid replacement. Production rejects enabled demo accounts or fixed test codes.
Keep `E2EE_ENABLED=true` and `E2EE_REQUIRED=true`; configuring the bot does not
complete that release gate.

## Pairing and login

1. Enter an international phone number in iOS or web.
2. Request `POST /api/auth/telegram/pairing` for that phone.
3. Open the returned `telegramStartUrl` and start the bot.
4. Use the bot's contact-sharing button to send your own contact.
5. Return to the client and request a code through `POST /api/auth/request`.
6. Read the six-digit code in Telegram and submit it to
   `POST /api/auth/verify` with the same phone.
7. Confirm `GET /api/auth/me` returns the authenticated user.

The pairing response contains `botUsername`, `telegramStartUrl`, and
`expiresIn`. Pairing tokens are random, short-lived, one-time values stored as
hashes. The contact must match the requested phone and, with the settings above,
the Telegram user sharing it. Typed phone messages do not replace contact
sharing.

Code requests intentionally return a generic `code_sent` response when no
Telegram link exists. They do not expose a `TELEGRAM_NOT_LINKED` error or prove
that a code was delivered. Complete pairing first and verify receipt in the bot.
Codes are stored as keyed hashes; expiry, attempt limits, and resend cooldown
are enforced by the backend.

Production auth requests require `X-Client-Platform: web`, `ios`, or `cli`.
iOS additionally requires `X-Device-ID`. Browser authentication sets HttpOnly
session cookies; iOS/CLI receive access and rotating refresh material in the
response. See [REAL_SMS_AUTH.md](./REAL_SMS_AUTH.md#api-verification) for the
shared verification/session behavior.

## Troubleshooting

- Missing bot token or username prevents pairing. A returned pairing URL alone
  does not validate the token with Telegram.
- Set `VERIFICATION_PROVIDER=telegram`; a bot started for a subscription mini
  app alone does not enable the auth contact-linking flow.
- Run one polling instance per bot token. Competing `getUpdates` consumers can
  cause polling conflicts.
- A provider failure during code delivery returns `503 Verification provider
  unavailable`. Invalid phone input returns `400`; rate limits/cooldowns return
  `429`.
- After rotating a bot token, update the protected environment and restart the
  process using the applicable deployment runbook.

Use [telegram-auth-cloudways.md](./telegram-auth-cloudways.md) for Cloudways
checks. Never commit bot tokens, codes, pairing URLs, session material, or env
files.
