# Mobile Messenger

[![CI](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml/badge.svg)](https://github.com/nepovtor/Mobile-Messenger-IOS/actions/workflows/swift.yml)

Portfolio-ready messenger platform with three coordinated parts:

- `MobileMessengerIOS/`: SwiftUI iOS app
- `web/`: React + TypeScript web client
- `server/`: NestJS backend with REST, WebSocket realtime, and push delivery

The project keeps the existing backend contract, Telegram verification flow, Cloudways deployment setup, and native WebSocket realtime.

## Repository Layout

- `MobileMessengerIOS/`: presentation, domain, data, and shared iOS layers
- `MobileMessengerIOS.xcodeproj/`: Xcode project, schemes, and workspace metadata
- `MobileMessengerIOSTests/`: iOS unit tests
- `web/`: browser client built with Vite + React
- `server/`: NestJS API, realtime gateway, push, and media services
- `docs/`: screenshots and portfolio-facing support material
- `Design/`: source assets such as the app icon artwork
- `Scripts/`: verification and local helper scripts
- `Config/`: environment examples and local configuration templates
- `.github/`: CI workflows

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
- security-minimized backend status for authorized administrators
- opt-in location sharing with browser permission prompt
- real Web Push via Service Worker + Push API + backend VAPID subscriptions
- auth/chat cleanup on logout

### Backend

- NestJS REST API
- strict TypeScript + ESLint configuration for lab compliance
- TypeORM `DataSource` + migrations in `server/src/database`
- native WebSocket realtime gateway
- Web Push delivery via `web-push` and VAPID
- APNs delivery for iOS device tokens
- request and error file logging with process-level error handlers
- PostgreSQL-backed users, devices, revocable sessions, and rotating refresh tokens
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
  -> PostgreSQL / Cloudways deployment
```

The repository follows feature-oriented boundaries:

- iOS keeps composition in `AppContainer` and delegates navigation, settings,
  session lifecycle, and connection lifecycle to dedicated coordinators.
- Web features live under `web/src/features/<feature>`; app-level
  orchestration lives under `web/src/app`, and shared infrastructure under
  `web/src/shared`.
- Backend modules communicate chat delivery through `ChatEventsModule`, so
  the chat domain does not depend on the realtime transport.

REST paths are defined canonically in `contracts/openapi.json`. Generated
Swift and TypeScript path helpers must not be edited manually.

```bash
node Scripts/generate-api-contract.mjs
make contract-check
```

## Shared API Contract

The route list below is a readable overview. The executable source of truth is
`contracts/openapi.json`; CI verifies both generated clients and NestJS
controller coverage.

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

## Security and E2EE Status

This branch hardens the server/client boundary and adds opaque per-device
delivery schema, but production E2EE is **not yet implemented**. Official
libsignal v0.99.2 cannot currently be integrated safely across this Swift/Xcode
and browser/Vite architecture without resolving unsupported integration paths
and AGPL-3.0-only licensing. No custom cryptographic protocol is substituted.

Production remains fail-closed with `E2EE_REQUIRED=true` until the decision and
interoperability gates in
[docs/E2EE_ARCHITECTURE.md](./docs/E2EE_ARCHITECTURE.md) are complete.

Security documentation:

- [security audit](./docs/SECURITY_AUDIT.md)
- [threat model](./docs/THREAT_MODEL.md)
- [E2EE architecture/decision gate](./docs/E2EE_ARCHITECTURE.md)
- [key management](./docs/KEY_MANAGEMENT.md)
- [deployment](./docs/SECURITY_DEPLOYMENT.md)
- [incident response](./docs/INCIDENT_RESPONSE.md)
- [legacy migration](./docs/MIGRATION_TO_E2EE.md)
- [backup and restore](./docs/BACKUP_RESTORE.md)

## Privacy

- location sharing is off by default
- the app requests geolocation only when the user taps share/update
- the user can stop sharing anytime
- only the latest location point is stored
- no location history is kept
- location visibility requires an accepted contact request and a separate,
  revocable per-contact permission
- exact location belongs in an E2EE payload after the protocol gate is complete

## Screenshots

Store portfolio screenshots in `docs/screenshots/` using these filenames:

- `docs/screenshots/login.png`
- `docs/screenshots/chat-list.png`
- `docs/screenshots/chat-thread.png`
- `docs/screenshots/contacts.png`
- `docs/screenshots/profile.png`
- `docs/screenshots/map.png`

Recommended sections in portfolio docs:

- Login
- Chat list
- Chat thread
- Contacts
- Profile
- Map

If screenshots are not available yet, keep the placeholders above and add the real images into `docs/screenshots/`.

## Deployment

- Cloudways backend base URL: `https://phpstack-1634854-6489525.cloudwaysapps.com`
- Health endpoint: `https://phpstack-1634854-6489525.cloudwaysapps.com/api/health`
- Version endpoint: `https://phpstack-1634854-6489525.cloudwaysapps.com/api/version`
- Realtime endpoint: `wss://phpstack-1634854-6489525.cloudwaysapps.com/realtime`
- legacy Railway config still lives in [railway.toml](./railway.toml)
- backend Docker setup lives in [server/Dockerfile](./server/Dockerfile) and [Dockerfile](./Dockerfile)
- production uses the validated current/previous JWT KID configuration,
  `/api/health`, and the security deployment gate

## Push Setup

### Web Push

Backend env:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- optional `PUSH_ALLOW_TEST_ENDPOINT=true` for non-production/manual testing

Generate VAPID keys from the locked backend dependency:

```bash
cd server
npm exec -- web-push generate-vapid-keys
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

## Media Uploads

Image messages use S3-compatible presigned URLs.

Backend env:

- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- optional `S3_PUBLIC_ENDPOINT`

Set `S3_PUBLIC_ENDPOINT` when the backend reaches storage through a private/internal host but iOS and web clients must upload through a separate public HTTPS host. If it is omitted, presigned upload and download URLs are generated from `S3_ENDPOINT`.

## Local Run

### Backend

```bash
cd server
cp .env.example .env
npm install
npm run lint
npm run build
npm run migration:run
npm test
npm run start:dev
```

For quick local-only development you can set `DB_SYNCHRONIZE=true`, but the laboratory-compliant mode uses `DB_SYNCHRONIZE=false` and `npm run migration:run`.

### Web

```bash
cd web
npm install
npm run dev
```

By default the Vite dev server runs on `http://127.0.0.1:3000` and proxies to the Cloudways backend at `https://phpstack-1634854-6489525.cloudwaysapps.com`.
To use a local backend instead, set `VITE_DEV_PROXY_TARGET=http://127.0.0.1:8080` or `VITE_DEV_DIRECT_BACKEND=true` before `npm run dev`.

### iOS

Open `MobileMessengerIOS.xcodeproj` in Xcode and run the `MobileMessengerIOS` scheme.
Debug and Release builds point to the Cloudways backend by default.
Use `MobileMessengerIOS/Configurations/Debug.public.xcconfig` or a local `Config/Config.xcconfig` only when you intentionally want to override that with a tunnel or local backend.

Useful configs:

- [MobileMessengerIOS/Configurations/Debug.xcconfig](./MobileMessengerIOS/Configurations/Debug.xcconfig)
- [MobileMessengerIOS/Configurations/Railway.xcconfig](./MobileMessengerIOS/Configurations/Railway.xcconfig)
- [Config/Config.example.xcconfig](./Config/Config.example.xcconfig)

## Logging & Error Handling

The backend writes logs into `server/logs/` through a single logger module:

- `server/logs/app.log`
- `server/logs/requests.log`
- `server/logs/errors.log`

Request logs include:

- `requestId`
- `method`
- route template without sensitive parameters
- `statusCode`
- `durationMs`
- internal principal ID when available

Raw URL/query/body/headers and sensitive fields such as passwords, OTP,
tokens/cookies, phones, messages, ciphertext, keys, coordinates, and presigned
URLs are not written.

Quick manual verification:

```bash
cd server
npm run start:dev
tail -f logs/requests.log
```

In another terminal:

```bash
curl http://127.0.0.1:8080/api/health
```

Then inspect `server/logs/requests.log` and confirm that the request entry contains `method`, `url`, `statusCode`, and `durationMs`. Runtime failures and uncaught process errors are written into `server/logs/errors.log`, while `process.on("uncaughtException")` and `process.on("unhandledRejection")` remain enabled in `server/src/main.ts`.

## Docker

Production compose (managed PostgreSQL/S3, protected env required):

```bash
PRODUCTION_ENV_FILE=/secure/config/mobile-messenger.production.env \
  docker compose -f server/docker-compose.yml up --detach --build
docker compose -f server/docker-compose.yml down
```

Development compose with live backend reload:

```bash
docker compose -f server/docker-compose.dev.yml up --build
docker compose -f server/docker-compose.dev.yml down
```

Production exposes only the backend on loopback for the host reverse proxy.
PostgreSQL, pgAdmin, and MinIO are not published by production Compose.
Development PostgreSQL/optional pgAdmin bind only to loopback and require
explicit credentials from `server/.env`.

Optional image scanning commands:

```bash
docker scout quickview mobile-messenger-backend:latest
trivy image mobile-messenger-backend:latest
```

Private Docker Hub push placeholders:

```bash
docker tag mobile-messenger-backend:latest <dockerhub-user>/mobile-messenger-backend:latest
docker push <dockerhub-user>/mobile-messenger-backend:latest
```

## Database Migrations

- TypeORM `DataSource`: `server/src/database/data-source.ts`
- migration directory: `server/src/database/migrations`
- lab mode uses migrations with `DB_SYNCHRONIZE=false`
- dev-only shortcut may use `DB_SYNCHRONIZE=true`, but this is not the recommended laboratory path

Commands:

```bash
cd server
npm run migration:show
npm run migration:run
npm run migration:revert
npm run migration:generate
```

## Authentication and Administration

Registration uses the OTP request/verify flow; arbitrary phone/password
creation is unavailable in production. Access tokens are short-lived and bound
to revocable database sessions. Refresh tokens rotate, are stored only as
keyed hashes, and revoke their family on reuse.

The browser uses Secure/HttpOnly/SameSite cookies and a clean WebSocket URL.
iOS stores session material in device-only Keychain and uses authorization
headers.

No administrator is seeded or loaded from environment credentials. Create one
after migrations from a restricted terminal:

```bash
cd server
npm run admin:create -- --login <login> --generate-password
```

See [docs/LABS_7_11_DETAILED.md](./docs/LABS_7_11_DETAILED.md) for the updated
laboratory mapping and safe verification commands.

## Testing Commands

### Backend

```bash
cd server
npm run migration:run
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

- Do not commit `.env`, `node_modules`, `dist`, `coverage`, `.build`, `database.sqlite`, `DerivedData`, `.DS_Store`, `xcuserdata`, `tsbuildinfo`, or secrets.
- Telegram bot tokens and Railway secrets must stay in environment variables.
- Push delivery requires real VAPID/APNs secrets in the environment; without them, the app keeps realtime working and logs a warning instead of sending fake notifications.
- The project does not claim calls, end-to-end encryption, avatar upload, or phonebook sync unless they are actually implemented.
