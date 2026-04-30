# Mobile Messenger iOS

[![CI](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml/badge.svg)](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml)

Portfolio-ready messenger MVP with a SwiftUI iOS client and a NestJS backend. REST is used for auth, chat list/history, and media upload. Native WebSocket is used for realtime delivery, typing, read events, and message send acknowledgements.

Real phone registration is now supported through Telegram verification in the portfolio/demo setup, while the existing SMS abstraction remains available for provider-backed deployments. Demo accounts remain available as a separate mode when enabled by environment flags.

## Web Client

A full React + TypeScript web client now lives in [web/](./web). It is preconfigured for the production backend and supports demo login, per-user chat lists, message history, realtime delivery, reconnect states, and logout cleanup.

Run it with:

```bash
cd web
npm install
npm run dev
```

Build it with:

```bash
npm run build
```

## Architecture

Text diagram:

```text
SwiftUI Views
  -> ViewModels / UseCases
    -> ChatRepository
      -> RESTChatService (auth, chats, history, media)
      -> DefaultChatRealtimeService (URLSessionWebSocketTask)
        -> NestJS REST Controllers
        -> NestJS WebSocketGateway (/realtime, native ws)
          -> ChatService / RealtimeService / AuthService
            -> PostgreSQL
            -> MinIO
```

## Implemented

- Native WebSocket realtime on `/realtime` with JWT handshake and connection registry.
- Heartbeat ping/pong, dead connection cleanup, reconnect with exponential backoff.
- Stable message lifecycle: `sending`, `sent`, `delivered`, `read`, `failed`, retry for failed local messages.
- REST auth, chat list, history, media upload, read receipts, typing.
- Real phone verification with Telegram delivery, TTL, resend cooldown, attempt limits, and JWT session issuance.
- Contacts list with per-user isolation, add/remove by phone, and direct chat reuse/creation.
- Secure profile display-name editing on backend, iOS, and web.
- Profile screen with account info, realtime status, and secure logout.
- Account info card with display name, phone fallback, user ID, and environment summary.
- Security card that confirms Keychain token storage and session cleanup on logout.
- Demo accounts with seeded chats for predictable demo flow.
- Backend e2e tests, backend heartbeat unit test, iOS unit tests, GitHub Actions CI.

## iOS App Features

- Auth with demo accounts and real backend session verification.
- Real phone sign-in on iOS and web via `/api/auth/request` and `/api/auth/verify`, with verification codes delivered through Telegram in the portfolio flow.
- Chat list with per-user chat isolation and unread state.
- Contacts tab with backend-backed add/remove by phone and direct chat opening.
- Message history, optimistic sending, retry for failed messages, and delivery state updates.
- Native WebSocket realtime via `URLSessionWebSocketTask`.
- Keychain-backed token storage.
- Profile screen with initials avatar, display name editing, phone, user ID fallback, and realtime status.
- Secure logout that clears session state, cached chats/messages, and realtime connectivity.

## Planned

- Push notification delivery from backend.
- Real media thumbnails and richer attachment previews.
- Presence / online indicators and stronger delivery semantics.
- Snapshot screenshots for App Store style presentation.

## Screenshots

Screenshots placeholder:

- `docs/screenshots/chat-list.png`
- `docs/screenshots/chat-thread.png`
- `docs/screenshots/auth.png`

## Demo Accounts

Backend seeds 5 demo users and 4 deterministic chats in development.

Demo mode is optional and controlled by environment flags. Real Telegram auth does not require demo accounts to stay enabled.

| User | Phone | Password | Visible Chats | Hidden Chats |
| --- | --- | --- | --- | --- |
| Анна Demo | `+15551230011` | `demo1111` | `Анна и Борис`, `Анна и Вера`, `Demo Team` | `Борис и Глеб` |
| Борис Demo | `+15551230012` | `demo2222` | `Анна и Борис`, `Борис и Глеб`, `Demo Team` | `Анна и Вера` |
| Вера Demo | `+15551230013` | `demo3333` | `Анна и Вера` | `Анна и Борис`, `Борис и Глеб`, `Demo Team` |
| Глеб Demo | `+15551230014` | `demo4444` | `Борис и Глеб`, `Demo Team` | `Анна и Вера` |
| Даша Demo | `+15551230015` | `demo5555` | `Demo Team` | `Анна и Борис`, `Анна и Вера`, `Борис и Глеб` |

## Demo Flow

1. Start the backend locally or select the Railway iOS config.
2. Login as Анна Demo with `+15551230011` / `demo1111`.
3. Open `Анна и Борис` or `Demo Team`.
4. Send a message and watch it move from `sending` to `sent`.
5. Open Profile and inspect realtime/session security info.
6. Logout from Profile.
7. Login as Борис Demo with `+15551230012` / `demo2222`.
8. Verify that a different chat set is shown for the second account.

## Backend

Requirements:

- Node.js 20+
- Docker Desktop

Run local backend:

```bash
make server
```

Manual flow:

```bash
docker compose -f server/docker-compose.dev.yml up -d
cd server
cp .env.example .env
npm install
npm run start:dev
```

For Telegram auth setup, see [docs/TELEGRAM_AUTH.md](./docs/TELEGRAM_AUTH.md). The previous SMS provider setup is still documented in [docs/REAL_SMS_AUTH.md](./docs/REAL_SMS_AUTH.md).

Key endpoints:

- REST base: `http://localhost:8080/api`
- WebSocket realtime: `ws://localhost:8080/realtime`
- Legacy SSE fallback: `GET /api/realtime/events`

## iOS

Open `MobileMessengerIOS.xcodeproj`, choose the `MobileMessengerIOS` scheme, and run on a simulator.

### iOS Config

- Debug local backend: [MobileMessengerIOS/Configurations/Debug.xcconfig](./MobileMessengerIOS/Configurations/Debug.xcconfig)
- Railway backend config: [MobileMessengerIOS/Configurations/Railway.xcconfig](./MobileMessengerIOS/Configurations/Railway.xcconfig)
- Example local override: [Config/Config.example.xcconfig](./Config/Config.example.xcconfig)

The Railway config points at the public backend and keeps existing Debug/Release configs unchanged.
Push notifications remain planned, so Railway keeps `FEATURE_PUSH = NO`.

To use Railway in Xcode:

1. Duplicate `Debug` or `Release` if you want a dedicated `Railway` build configuration.
2. Set its Base Configuration to `MobileMessengerIOS/Configurations/Railway.xcconfig`.
3. Run the existing `MobileMessengerIOS` scheme with that build configuration.

### iOS Build

When running tests from Terminal, pass an explicit iOS Simulator `-destination`. Without it, `xcodebuild test` may pick a Mac/Catalyst path and fail before the Swift tests even start.

Build from terminal:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  CODE_SIGNING_ALLOWED=NO \
  build
```

### iOS Testing

Run tests on an available simulator:

```bash
xcrun simctl list devices available
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,id=5B35CA4E-0218-4562-98CD-22DDBFD7E68D' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

iOS test coverage includes:

- auth verify response decoding;
- chat and message DTO decoding;
- shared ISO-8601 date decoding;
- message dedup by server ID and client message ID;
- message ack, failed state, retry, logout cleanup, and reconnect behavior;
- profile/auth/chat list view model scenarios;
- user-switch cleanup for cached chat state.

## Testing Commands

```bash
cd server && npm ci
cd server && npm run lint
cd server && npm test
cd server && npm run build
```

Convenience target:

```bash
make test-ios
```

## Security Notes

- JWT is required for REST and WebSocket handshake; invalid or expired tokens are rejected.
- Auth endpoints are rate limited.
- Verification codes are stored hashed, expire automatically, and enforce resend cooldown plus max attempts.
- Telegram bot tokens and provider credentials must stay in environment variables and never be committed.
- iOS auth token is stored in Keychain with `ThisDeviceOnly` accessibility.
- Logout clears token, current user session, local chats/messages, and closes realtime connection.
- Reconnect is disabled for explicit logout or manual disconnect.
- Sensitive auth values are not written to analytics/logging.

## CI

GitHub Actions runs:

- backend: `npm ci`, `npm run lint`, `npm test`, `npm run build`
- iOS: `xcodebuild test`
