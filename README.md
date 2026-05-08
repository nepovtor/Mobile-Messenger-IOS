# Mobile Messenger

[![CI](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml/badge.svg)](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml)

Portfolio-ready messenger project with three clients:

- `MobileMessengerIOS/`: SwiftUI iOS app
- `web/`: React + TypeScript web client
- `server/`: NestJS backend with REST + WebSocket realtime

The project keeps the existing backend contract, Telegram verification flow, Railway deployment setup, and native WebSocket realtime.

## Features

### iOS

- phone auth with Telegram verification
- chat list and direct/group chat threads
- native WebSocket realtime, typing, read state, delivery state
- contacts screen with add-by-phone, empty/loading/error states, and direct chat opening
- profile display name editing via `PATCH /api/users/me/profile`
- map page with opt-in location sharing
- contacts can see only shared locations
- location is requested only when the user chooses to share or update
- Keychain token storage
- logout cleanup and user-switch cleanup

### Web

- login with the existing backend auth flow
- chat list and chat thread UI
- native WebSocket realtime
- toast notifications with auto-dismiss after 3 seconds
- contacts tab with add-by-phone and direct chat opening
- profile display name editing in the user menu
- map page with Leaflet + OpenStreetMap
- redesigned product-style landing, messenger workspace, map workspace, and admin entry
- protected system dashboard for labs 7-11 overview
- JWT session payload preview, backend status, and recent logs in the browser
- opt-in location sharing with browser permission prompt
- real Web Push via Service Worker + Push API + backend VAPID subscriptions
- auth/chat cleanup on logout

### Backend

- NestJS REST API
- native WebSocket realtime gateway
- Web Push delivery via `web-push` and VAPID
- APNs delivery for iOS device tokens
- request and error file logging with process-level error handlers
- contacts API
- profile API
- location API with latest-point storage only
- Telegram verification provider support
- auth rate limiting
- protected `/api/system/*` observability endpoints
- automated tests

## Architecture

```text
iOS SwiftUI / Web React
  -> REST API for auth, contacts, profile, chats, media
  -> Push endpoints for Web Push subscriptions and APNs device tokens
  -> Native WebSocket for realtime events
  -> NestJS modules (auth, chat, contacts, users, realtime, media, push)
  -> PostgreSQL / Railway deployment
```

## API Contract Used

These endpoints are used by both clients:

- `GET /api/contacts`
- `POST /api/contacts`
- `DELETE /api/contacts/:identifier`
- `PATCH /api/users/me/profile`
- `GET /api/location/me`
- `POST /api/location/me`
- `DELETE /api/location/me`
- `GET /api/location/contacts`

Realtime remains WebSocket-based through the existing gateway.

Push-related endpoints:

- `GET /api/push/vapid-public-key`
- `GET /api/push/status`
- `POST /api/push/subscriptions`
- `DELETE /api/push/subscriptions`
- `POST /api/push/devices`
- `DELETE /api/push/devices/:token`

## Privacy Notes

- location sharing is off by default
- the app requests geolocation only when the user taps share/update
- the user can stop sharing anytime
- only the latest location point is stored
- no location history is kept
- contacts can see only locations that were explicitly shared with them

## Screenshots

Place screenshots here:

- `docs/screenshots/login.png`
- `docs/screenshots/chat-list.png`
- `docs/screenshots/chat-thread.png`
- `docs/screenshots/contacts.png`
- `docs/screenshots/profile.png`
- `docs/screenshots/map.png`

Sections expected in portfolio docs:

- Login
- Chat list
- Chat thread
- Contacts
- Profile
- Map

If screenshots are not available yet, keep the placeholders above and add the real images into `docs/screenshots/`.

## Railway

- Railway config lives in [railway.toml](./railway.toml)
- backend Docker setup lives in [server/Dockerfile](./server/Dockerfile) and [Dockerfile](./Dockerfile)
- backend keeps `process.env.PORT`, `JWT_SECRET`, `/api/health`, and Telegram provider safety checks intact

## Push Setup

### Web Push

Backend env:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- optional `PUSH_ALLOW_TEST_ENDPOINT=true` for non-production/manual testing

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

The web client registers `web/public/sw.js`, asks for permission only after a user action, creates a real `PushSubscription`, and sends it to the backend. If the VAPID env vars are missing, the backend does not fake delivery: it logs a warning and skips Web Push sending.

### iOS APNs

Backend env:

- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY`
- `APNS_ENVIRONMENT=sandbox|production`

iOS app notes:

- the Xcode project now includes `aps-environment` entitlements for APNs
- the app requests notification authorization from the profile screen
- after permission is granted, the app registers for remote notifications, captures the APNs device token, and syncs it through `/api/push/devices`
- logout attempts to detach the current device token from the backend session

If APNs env vars are missing, the backend does not pretend push works: it logs a warning and safely skips APNs delivery.

## Local Run

### Backend

```bash
cd server
npm install
npm run lint
npm run build
npm test
npm run start:dev
```

### Web

```bash
cd web
npm install
npm run dev
```

By default the Vite dev server runs on `http://127.0.0.1:3000` and points to the local backend at `http://127.0.0.1:8080/api`.

### iOS

Open `MobileMessengerIOS.xcodeproj` in Xcode and run the `MobileMessengerIOS` scheme.

Useful configs:

- [MobileMessengerIOS/Configurations/Debug.xcconfig](./MobileMessengerIOS/Configurations/Debug.xcconfig)
- [MobileMessengerIOS/Configurations/Railway.xcconfig](./MobileMessengerIOS/Configurations/Railway.xcconfig)
- [Config/Config.example.xcconfig](./Config/Config.example.xcconfig)

## Testing Commands

### Backend

```bash
cd server
npm run build
npm test
npm run lint
```

### Web

```bash
cd web
npm run lint
npm test
npm run build
```

### iOS

```bash
xcodebuild -project MobileMessengerIOS.xcodeproj -scheme MobileMessengerIOS CODE_SIGNING_ALLOWED=NO build
```

If a simulator is available:

```bash
xcodebuild -project MobileMessengerIOS.xcodeproj -scheme MobileMessengerIOS CODE_SIGNING_ALLOWED=NO test
```

## Notes

- Do not commit `.env`, `node_modules`, `dist`, `database.sqlite`, `DerivedData`, `.DS_Store`, `xcuserdata`, `tsbuildinfo`, or secrets.
- Telegram bot tokens and Railway secrets must stay in environment variables.
- Push delivery requires real VAPID/APNs secrets in the environment; without them, the app keeps realtime working and logs a warning instead of sending fake notifications.
- The project does not claim calls, end-to-end encryption, avatar upload, or phonebook sync unless they are actually implemented.
