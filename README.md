# Mobile Messenger iOS

[![CI](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml/badge.svg)](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml)

Portfolio-ready messenger MVP with a SwiftUI iOS client and a NestJS backend. REST is used for auth, chat list/history, and media upload. Native WebSocket is used for realtime delivery, typing, read events, and message send acknowledgements.

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
- Profile screen with account info, realtime status, and secure logout.
- Account info card with display name, phone fallback, user ID, and environment summary.
- Security card that confirms Keychain token storage and session cleanup on logout.
- Demo accounts with seeded chats for predictable demo flow.
- Backend e2e tests, backend heartbeat unit test, iOS unit tests, GitHub Actions CI.

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

- `+15551230011` / `demo1111` — Анна Demo
  sees: `Анна и Борис`, `Анна и Вера`, `Demo Team`
  does not see: `Борис и Глеб`
- `+15551230012` / `demo2222` — Борис Demo
  sees: `Анна и Борис`, `Борис и Глеб`, `Demo Team`
  does not see: `Анна и Вера`
- `+15551230013` / `demo3333` — Вера Demo
  sees: `Анна и Вера`
  does not see: `Анна и Борис`, `Борис и Глеб`, `Demo Team`
- `+15551230014` / `demo4444` — Глеб Demo
  sees: `Борис и Глеб`, `Demo Team`
  does not see: `Анна и Вера`
- `+15551230015` / `demo5555` — Даша Demo
  sees: `Demo Team`
  does not see: `Анна и Борис`, `Анна и Вера`, `Борис и Глеб`

## Demo Flow

1. Start backend and open the iOS app.
2. Login as Анна Demo with `+15551230011` / `demo1111`.
3. Open `Анна и Борис` or `Demo Team`.
4. Send a message and watch it move from `sending` to `sent`.
5. Login as Борис Demo with `+15551230012` / `demo2222`.
6. Open the shared chat and verify realtime `message.created` without refresh.

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

Key endpoints:

- REST base: `http://localhost:8080/api`
- WebSocket realtime: `ws://localhost:8080/realtime`
- Legacy SSE fallback: `GET /api/realtime/events`

## iOS

Open `MobileMessengerIOS.xcodeproj`, choose the `MobileMessengerIOS` scheme, and run on a simulator.

When running tests from Terminal, pass an explicit iOS Simulator `-destination`. Without it, `xcodebuild test` may pick a Mac/Catalyst path and fail before the Swift tests even start.

Build from terminal:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## Testing Commands

```bash
cd server && npm ci
cd server && npm run lint
cd server && npm test
cd server && npm run build
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,id=5B35CA4E-0218-4562-98CD-22DDBFD7E68D' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Convenience target:

```bash
make test-ios
```

## Security Notes

- JWT is required for REST and WebSocket handshake; invalid or expired tokens are rejected.
- Auth endpoints are rate limited.
- iOS auth token is stored in Keychain with `ThisDeviceOnly` accessibility.
- Logout clears token, current user session, local chats/messages, and closes realtime connection.
- Reconnect is disabled for explicit logout or manual disconnect.
- Sensitive auth values are not written to analytics/logging.

## CI

GitHub Actions runs:

- backend: `npm ci`, `npm run lint`, `npm test`, `npm run build`
- iOS: `xcodebuild test`
