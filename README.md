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
- JWT session payload preview, backend status, and recent logs in the browser
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
- PostgreSQL-backed user/admin authentication with JWT bearer tokens
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

## Shared API Contract

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

## Privacy

- location sharing is off by default
- the app requests geolocation only when the user taps share/update
- the user can stop sharing anytime
- only the latest location point is stored
- no location history is kept
- contacts can see only locations that were explicitly shared with them

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
- backend keeps `process.env.PORT`, `JWT_SECRET_KEY` with `JWT_SECRET` fallback, `/api/health`, and Telegram provider safety checks intact

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

- `method`
- `url`
- `query`
- `body`
- `statusCode`
- `durationMs`

Sensitive fields such as passwords, secrets, tokens, and verification hashes are redacted before being written.

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

Production-like lab compose:

```bash
docker compose -f server/docker-compose.yml up --build
docker compose -f server/docker-compose.yml down
```

Development compose with live backend reload:

```bash
docker compose -f server/docker-compose.dev.yml up --build
docker compose -f server/docker-compose.dev.yml down
```

After `docker compose -f server/docker-compose.yml up --build`:

- backend: `http://127.0.0.1:8080/api`
- health check: `http://127.0.0.1:8080/api/health`
- pgAdmin: `http://127.0.0.1:5050`
- PostgreSQL from host: `postgresql://postgres:postgres@127.0.0.1:5432/messenger`

pgAdmin connection values:

- host: `postgres`
- port: `5432`
- username: `postgres`
- password: `postgres`
- database: `messenger`

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

## Authentication & JWT

Create a user with a bcrypt-hashed password:

```bash
curl -X POST http://127.0.0.1:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "login": "student",
    "password": "secret123",
    "displayName": "Student User",
    "phone": "+15550001111"
  }'
```

Login through the laboratory endpoint:

```bash
curl -X POST http://127.0.0.1:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "student",
    "password": "secret123"
  }'
```

Use the returned JWT as Bearer:

```bash
TOKEN="<jwt_token>"
curl http://127.0.0.1:8080/api/contacts \
  -H "Authorization: Bearer ${TOKEN}"
```

Public routes:

- `/`
- `/api`
- `/api/health`
- `/api/version`
- `/api/login`
- `/api/users`
- `/api/auth/request`
- `/api/auth/verify`
- `/api/auth/login`
- `/api/admin/login`
- `/api/push/vapid-public-key`

Protected user routes:

- `/api/auth/me`
- `/api/contacts/*`
- `/api/chats/*`
- `/api/location/*`
- `/api/media/*`
- `/api/push/status`
- `/api/push/subscriptions`
- `/api/push/devices`

Admin-only routes:

- `/api/admin/me`
- `/api/system/*`

How to check `401`:

```bash
curl http://127.0.0.1:8080/api/contacts
```

How to check `403`:

1. Create a user and login to get a valid JWT.
2. Delete that user from PostgreSQL through `psql` or pgAdmin.
3. Repeat a protected request with the old token and confirm the backend returns `403`.

## Laboratory Compliance

### Lab 7 — TypeScript

- `server/tsconfig.json` now targets `ES2022` and enables strict compiler checks including `strict`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, and `noPropertyAccessFromIndexSignature`.
- `server/.eslintrc.json` stays active for `src/` and `test/`, and the backend codebase was adjusted to avoid direct `any`/`unknown` usage.
- Verification commands:

```bash
cd server
npm run lint
npm run build
```

### Lab 8 — Logging & Error Handling

- request logging middleware writes all incoming requests into `server/logs/requests.log`
- errors are written into `server/logs/errors.log`
- runtime `500` responses are normalized through the global exception filter
- `uncaughtException` and `unhandledRejection` handlers remain active
- all logging is centralized in `server/src/modules/common/app-logger.ts`

How to verify:

```bash
cd server
npm run start:dev
curl http://127.0.0.1:8080/api/health
tail -n 5 logs/requests.log
```

### Lab 9 — Docker Basics

- added `server/docker-compose.yml` for backend + PostgreSQL + pgAdmin
- kept `server/docker-compose.dev.yml` for hot reload with `npm run start:dev`
- added named volumes for PostgreSQL, pgAdmin, and backend logs
- added a dedicated bridge network `messenger_network`
- PostgreSQL now has a healthcheck and backend startup waits for database readiness

Run commands:

```bash
docker compose -f server/docker-compose.yml up --build
docker compose -f server/docker-compose.yml down
```

### Lab 10 — PostgreSQL & TypeORM

- added `server/src/database/data-source.ts`
- added `server/src/database/migrations`
- added an initial migration that creates the messenger schema and seeds a DB admin
- `synchronize` remains available only for local dev, while the lab path uses migrations

Migration commands:

```bash
cd server
npm run migration:show
npm run migration:run
npm run migration:revert
```

### Lab 11 — Authentication & JWT

- `users` now support nullable `login` and `passwordHash`
- `POST /api/users` stores bcrypt password hashes
- `POST /api/login` returns `{ "token": "..." }`
- JWT payload includes user `id` and `login`
- user auth is enforced with a global guard plus explicit public-route exclusions
- `admins` are stored in PostgreSQL, with `admin/admin` seeded by migration and env fallback preserved

Example curls:

```bash
curl -X POST http://127.0.0.1:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"login":"student","password":"secret123","displayName":"Student User"}'

curl -X POST http://127.0.0.1:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"login":"student","password":"secret123"}'
```

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
