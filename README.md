# Mobile Messenger iOS

Portfolio-ready messenger prototype with a SwiftUI iOS client and NestJS backend.

## Implemented

### iOS
- SwiftUI app with auth, chat list, dialogue screen and profile screen.
- Auth flows:
  - `POST /auth/request`
  - `POST /auth/verify`
  - `POST /auth/login`
- Session storage with access token in Keychain and user metadata in `UserDefaults`.
- Centralized authenticated request building for REST and realtime.
- Local chat persistence and optimistic message sending.
- Media upload flow for image messages.
- Realtime sync over authenticated SSE:
  - connection state tracking
  - reconnect with exponential backoff
  - max reconnect delay
  - manual disconnect / logout stop reconnect attempts
  - heartbeat handling for backend keepalive events

### Backend
- NestJS REST API for auth, chats, messages, typing and media.
- JWT bearer auth for REST and realtime.
- SSE realtime endpoint at `GET /api/realtime/events`.
- Periodic realtime keepalive events.
- Socket.IO gateway exists in backend, but the current iOS client uses SSE.

### CI
- GitHub Actions:
  - backend lint
  - backend tests
  - iOS build
  - iOS tests

## Testing

### iOS
Run from Xcode with `Cmd + U` or via CLI:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,OS=latest,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Current iOS tests cover:
- auth response decoding
- backend auth error mapping
- session persistence through `TokenStore`
- DTO to domain mapping
- use case to repository calls
- repository optimistic send flow
- realtime state transitions

### Backend

```bash
cd server
npm run lint
npm test
```

## Security

- Access token is stored in Keychain via `KeychainTokenStore`.
- `SessionStore` works through `TokenStore`, not direct token storage in `UserDefaults`.
- Bearer auth header is added centrally through `AuthorizedRequestFactory`.
- Sensitive auth data is not printed from iOS analytics or backend auth code generation flow.
- SSL pinning is not implemented in the current codebase.

## Realtime

- iOS realtime transport is SSE, not raw WebSocket.
- Backend realtime auth expects `Authorization: Bearer <token>`.
- iOS realtime reconnects with exponential backoff and stops reconnecting after manual disconnect or logout.
- Backend now emits periodic `keepalive` events; iOS treats incoming stream activity as connection health.

## Project structure

```text
MobileMessengerIOS/
  Data/
  Domain/
  Presentation/
  Shared/
server/
MobileMessengerIOSTests/
.github/workflows/
```

## In progress / Planned

- End-to-end encryption
- APNs / FCM push delivery
- Voice / video calls
- SSL pinning
- Fastlane / TestFlight delivery flow
- Wider backend realtime coverage beyond current SSE client path

## Notes

- Backend user IDs are UUID strings and are decoded as UUID on iOS.
- README claims are intentionally limited to behavior confirmed by the current code and tests.
