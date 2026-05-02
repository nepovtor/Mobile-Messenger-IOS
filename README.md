# Mobile Messenger

[![CI](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml/badge.svg)](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml)

Portfolio-ready messenger project with three clients:

- `MobileMessengerIOS/`: SwiftUI iOS app
- `web/`: React + TypeScript web client
- `server/`: NestJS backend with REST + WebSocket realtime

The project keeps the existing backend contract, Telegram verification flow, demo accounts, Railway deployment setup, and native WebSocket realtime.

## Features

### iOS

- phone auth with Telegram verification
- demo accounts for portfolio demos
- chat list and direct/group chat threads
- native WebSocket realtime, typing, read state, delivery state
- contacts screen with add-by-phone, empty/loading/error states, and direct chat opening
- profile display name editing via `PATCH /api/users/me/profile`
- Keychain token storage
- logout cleanup and user-switch cleanup

### Web

- login with the existing backend auth flow
- chat list and chat thread UI
- native WebSocket realtime
- contacts tab with add-by-phone and direct chat opening
- profile display name editing in the user menu
- auth/chat cleanup on logout

### Backend

- NestJS REST API
- native WebSocket realtime gateway
- contacts API
- profile API
- Telegram verification provider support
- auth rate limiting
- automated tests

## Architecture

```text
iOS SwiftUI / Web React
  -> REST API for auth, contacts, profile, chats, media
  -> Native WebSocket for realtime events
  -> NestJS modules (auth, chat, contacts, users, realtime, media)
  -> PostgreSQL / Railway deployment
```

## API Contract Used

These endpoints are used by both clients:

- `GET /api/contacts`
- `POST /api/contacts`
- `DELETE /api/contacts/:identifier`
- `PATCH /api/users/me/profile`

Realtime remains WebSocket-based through the existing gateway.

## Demo Accounts

| User | Phone | Password |
| --- | --- | --- |
| Анна Demo | `+15551230011` | `demo1111` |
| Борис Demo | `+15551230012` | `demo2222` |
| Вера Demo | `+15551230013` | `demo3333` |
| Глеб Demo | `+15551230014` | `demo4444` |
| Даша Demo | `+15551230015` | `demo5555` |

## Screenshots

Place screenshots here:

- `docs/screenshots/login.png`
- `docs/screenshots/chat-list.png`
- `docs/screenshots/chat-thread.png`
- `docs/screenshots/contacts.png`
- `docs/screenshots/profile.png`

Sections expected in portfolio docs:

- Login
- Chat list
- Chat thread
- Contacts
- Profile

If screenshots are not available yet, keep the placeholders above and add the real images into `docs/screenshots/`.

## Railway

- Railway config lives in [railway.toml](./railway.toml)
- backend Docker setup lives in [server/Dockerfile](./server/Dockerfile) and [Dockerfile](./Dockerfile)
- backend keeps `process.env.PORT`, `JWT_SECRET`, `/api/health`, and Telegram provider safety checks intact

## Local Run

### Backend

```bash
cd server
npm install
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
- The project does not claim push notifications, calls, end-to-end encryption, avatar upload, or phonebook sync unless they are actually implemented.
