# Phone Verification and SMS Auth

The backend implements phone verification through Twilio SMS, Telegram, or
local console/mock providers. Provider selection does not establish production
readiness: production messaging remains blocked by the
[E2EE decision gate](./E2EE_ARCHITECTURE.md).

Use [server/.env.example](../server/.env.example) for local development and
[server/production.env.example](../server/production.env.example) together with
the [security deployment runbook](./SECURITY_DEPLOYMENT.md) for production
configuration. These templates require real database settings and independent
secrets; they are not ready-to-run production credentials.

## Local verification without SMS

After configuring `server/.env` from the local template, explicitly enable a
local test code when using console delivery:

```env
NODE_ENV=development
VERIFICATION_PROVIDER=console
SMS_PROVIDER=console
AUTH_ENABLE_DEMO_ACCOUNTS=false
PASSWORD_LOGIN_ENABLED=false
AUTH_ALLOW_TEST_CODE=true
AUTH_TEST_CODE=123456
```

`POST /api/auth/request` accepts an international phone number and returns
`debugCode` only outside production when `AUTH_ALLOW_TEST_CODE=true`. The
console provider logs a generic challenge event, not the OTP. The mock provider
keeps sent codes in memory for tests and does not send SMS.

Demo account/password login is separate from OTP verification. It requires both
`AUTH_ENABLE_DEMO_ACCOUNTS=true` and `PASSWORD_LOGIN_ENABLED=true`; keep these
shortcuts confined to local development. `AUTH_ALLOW_PASSWORD_LOGIN` is a
legacy fallback; `PASSWORD_LOGIN_ENABLED` takes precedence.

## Twilio delivery

Apply these provider settings to the appropriate environment template:

```env
VERIFICATION_PROVIDER=sms
SMS_PROVIDER=twilio
AUTH_ENABLE_DEMO_ACCOUNTS=false
AUTH_ALLOW_TEST_CODE=false
PASSWORD_LOGIN_ENABLED=false
AUTH_CODE_TTL_SECONDS=300
AUTH_CODE_MAX_ATTEMPTS=5
AUTH_CODE_RESEND_COOLDOWN_SECONDS=60
```

Supply `SMS_TWILIO_ACCOUNT_SID`, `SMS_TWILIO_AUTH_TOKEN`, and
`SMS_TWILIO_FROM` through the protected environment. `SMS_FROM` is the fallback
sender if `SMS_TWILIO_FROM` is absent. Delivery still depends on valid provider
credentials, an allowed sender/recipient, and provider availability. Missing
credentials or a failed delivery returns `503 Verification provider unavailable`.

Twilio is the implemented external SMS adapter. Although configuration parsing
recognizes `vonage` and `smsru`, this build has no dedicated adapters for them;
do not treat those values as supported delivery integrations.

For Telegram delivery, use [TELEGRAM_AUTH.md](./TELEGRAM_AUTH.md) and set
`VERIFICATION_PROVIDER=telegram`; `SMS_PROVIDER` does not select Telegram.

## Production requirements

The complete requirements live in the production template and security runbook.
In particular, production uses:

- distinct current/previous `JWT_ACCESS_*_KEY_ID` and `JWT_ACCESS_*_SECRET`
  values, plus independent OTP, refresh-token, and log hashing secrets;
- `JWT_ACCESS_EXPIRES_IN=10m` and `JWT_REFRESH_EXPIRES_IN=30d` in the template;
  the validator accepts access lifetimes from 60 seconds to 15 minutes and
  refresh lifetimes from 1 to 90 days;
- `AUTH_ENABLE_DEMO_ACCOUNTS=false`, `AUTH_ALLOW_TEST_CODE=false`, and
  `PASSWORD_LOGIN_ENABLED=false`;
- `E2EE_ENABLED=true` and `E2EE_REQUIRED=true`, with the release gate still
  closed until interoperable client encryption is implemented and reviewed.

Legacy `JWT_SECRET`/`JWT_SECRET_KEY` values do not replace the required
production key configuration. A seven-day access token is rejected by the
production validator. Console/mock delivery and fixed test codes are local/test
tools, not a production verification setup.

## API verification

1. Start the configured backend and database using the root
   [local setup instructions](../README.md#local-development).
2. Use a phone number you control and request a code with
   `POST /api/auth/request` and body `{"phone":"<international-phone>"}`.
3. Submit `POST /api/auth/verify` with the same phone and received code:
   `{"phone":"<international-phone>","code":"<received-code>"}`.
4. Confirm the authenticated client can call `GET /api/auth/me`.
5. Verify resend cooldown and incorrect/expired code handling without recording
   OTPs or session material in shared output.

Auth requests in production require `X-Client-Platform: web`, `ios`, or `cli`.
iOS also requires a stable `X-Device-ID`; CLI callers should send one to keep a
consistent device context. Browser clients receive HttpOnly session cookies;
iOS/CLI receive access and refresh material in the verification response.
Use the browser client or an isolated cookie jar when checking web sessions.

Keep provider credentials, OTPs, access/refresh tokens, database credentials,
and local environment files outside Git.
