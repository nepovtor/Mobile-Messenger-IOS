# Real SMS Auth

Mobile Messenger now supports two auth modes side by side:

- `demo mode` for portfolio demos and seeded chats
- `real SMS mode` for production-ready phone verification

## Development Mode

Use console or mock delivery while keeping demo shortcuts available:

```env
SMS_PROVIDER=console
AUTH_ENABLE_DEMO_ACCOUNTS=true
AUTH_ALLOW_TEST_CODE=true
AUTH_TEST_CODE=123456
AUTH_CODE_TTL_SECONDS=300
AUTH_CODE_MAX_ATTEMPTS=5
AUTH_CODE_RESEND_COOLDOWN_SECONDS=60
JWT_SECRET=local-dev-change-me
JWT_EXPIRES_IN=7d
```

Recommended behavior in development:

- `POST /api/auth/request` accepts a real-looking international phone number.
- The backend stores only a hashed verification code.
- `console` provider logs the code only in non-production environments.
- Demo accounts keep working through `/api/auth/login` when enabled.

## Production / Railway Mode

Use a real SMS provider and disable the shared test code:

```env
SMS_PROVIDER=twilio
AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_TEST_CODE=false
AUTH_CODE_TTL_SECONDS=300
AUTH_CODE_MAX_ATTEMPTS=5
AUTH_CODE_RESEND_COOLDOWN_SECONDS=60
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
SMS_FROM=MobileMsg
SMS_TWILIO_ACCOUNT_SID=...
SMS_TWILIO_AUTH_TOKEN=...
SMS_TWILIO_FROM=...
```

If you still want demo accounts in production for showcase builds, set:

```env
AUTH_ENABLE_DEMO_ACCOUNTS=true
AUTH_ALLOW_PASSWORD_LOGIN=true
```

## Railway Variables

Add these Railway variables:

- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `AUTH_ENABLE_DEMO_ACCOUNTS`
- `AUTH_ALLOW_TEST_CODE`
- `AUTH_TEST_CODE`
- `AUTH_CODE_TTL_SECONDS`
- `AUTH_CODE_MAX_ATTEMPTS`
- `AUTH_CODE_RESEND_COOLDOWN_SECONDS`
- `SMS_PROVIDER`
- `SMS_FROM`
- `SMS_TWILIO_ACCOUNT_SID`
- `SMS_TWILIO_AUTH_TOKEN`
- `SMS_TWILIO_FROM`

Do not commit provider credentials or `.env` files:

- SMS credentials are secrets and must stay in Railway variables.
- JWT secret must never live in source control.
- Demo/test code must not be enabled in production unless you explicitly want that behavior.

## How To Test

1. Deploy backend changes to Railway.
2. Set the Railway variables listed above.
3. Open iOS or web client.
4. Enter a phone number in international format like `+15551230011`.
5. Call `POST /api/auth/request`.
6. Wait for the SMS from Twilio, or use `console` output in development.
7. Call `POST /api/auth/verify` with the same phone and the received code.
8. Confirm a JWT is returned and chats load normally.

Example request payloads:

```json
{
  "phone": "+15551230011"
}
```

```json
{
  "phone": "+15551230011",
  "code": "123456"
}
```

## Disabling Demo Accounts

To fully disable demo auth:

```env
AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_PASSWORD_LOGIN=false
AUTH_ALLOW_TEST_CODE=false
```

That leaves only real SMS verification enabled.
