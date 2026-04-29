# Telegram Auth

Mobile Messenger supports real phone login through a Telegram bot in the portfolio/demo deployment, while demo accounts remain available as an optional parallel mode.

## Create A Bot

1. Open Telegram and find `@BotFather`.
2. Run `/newbot`.
3. Choose a bot name and a unique username ending with `bot`.
4. Copy the bot token from BotFather.
5. Set a recognizable description so users know it belongs to your project.

Do not commit the bot token. Keep it only in Railway or local environment variables.

## Railway Variables

Add these variables in Railway:

```env
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
AUTH_ENABLE_DEMO_ACCOUNTS=true
AUTH_ALLOW_TEST_CODE=false
AUTH_TEST_CODE=123456
AUTH_CODE_TTL_SECONDS=300
AUTH_CODE_MAX_ATTEMPTS=5
AUTH_CODE_RESEND_COOLDOWN_SECONDS=60
AUTH_ALLOW_PASSWORD_LOGIN=true
VERIFICATION_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=your_project_bot
```

Optional for development:

```env
VERIFICATION_PROVIDER=console
AUTH_ENABLE_DEMO_ACCOUNTS=true
AUTH_ALLOW_TEST_CODE=true
AUTH_TEST_CODE=123456
```

If you still want provider-backed SMS delivery in another deployment, keep using the existing SMS env variables and set `VERIFICATION_PROVIDER=sms`.

## User Linking Flow

1. Open the Telegram bot.
2. Press `/start`.
3. Tap the contact-sharing button or send your phone number in international format.
4. Return to the iOS or web app.
5. Enter the same phone number and request the code.
6. Read the 6-digit code in Telegram and verify it in the app.

If the phone is not linked yet, `/api/auth/request` returns:

```json
{
  "code": "TELEGRAM_NOT_LINKED",
  "message": "Open the Telegram bot and send your phone number before requesting a code."
}
```

## Disable Demo Accounts

To leave only the real verification flow:

```env
AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_PASSWORD_LOGIN=false
AUTH_ALLOW_TEST_CODE=false
```

## Development Notes

- `VERIFICATION_PROVIDER=console` keeps local development simple.
- `VERIFICATION_PROVIDER=telegram` requires `TELEGRAM_BOT_TOKEN`.
- `TELEGRAM_BOT_USERNAME` is used by iOS and web to build the "Open Telegram bot" button.
- Users never see the bot token or Telegram chat ID in the UI.

## Security Notes

- Store `TELEGRAM_BOT_TOKEN` only in environment variables.
- Verification codes are stored hashed, never in plain text.
- Codes expire after `AUTH_CODE_TTL_SECONDS`.
- Wrong code attempts are limited by `AUTH_CODE_MAX_ATTEMPTS`.
- Resend cooldown is enforced by `AUTH_CODE_RESEND_COOLDOWN_SECONDS`.
- JWT secrets must stay outside the repository.
