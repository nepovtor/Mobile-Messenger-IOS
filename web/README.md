# Mobile Messenger Web

React + TypeScript browser client for the [Mobile Messenger](../README.md)
NestJS backend. It uses REST and native WebSocket realtime, with separate user
and administrator sessions.

Production end-to-end encryption is **not implemented**. The backend production
gate requires E2EE, so the current plaintext message, voice, and location flows
must not be presented as a production encrypted messenger. See the
[E2EE architecture](../docs/E2EE_ARCHITECTURE.md) and
[deployment requirements](../docs/SECURITY_DEPLOYMENT.md).

## Requirements and local setup

Use **Node.js 24** and npm with the committed `package-lock.json`. Some locked
dependencies require Node.js 22 or later; Node.js 20 is insufficient for the
current dependency set.

From the repository root:

```bash
cd web
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. The port is fixed: Vite exits if port 3000 is
already occupied. By default, `/api` HTTP requests and `/realtime` WebSocket
connections are forwarded to the configured Cloudways backend:
`https://phpstack-1634854-6489525.cloudwaysapps.com`. This is a configured default,
not a guarantee that the remote service is available or compatible.

For local development, start the backend using the
[repository setup instructions](../README.md#local-development), then run:

```bash
VITE_DEV_PROXY_TARGET=http://127.0.0.1:8080 npm run dev
```

The proxy keeps browser requests on the frontend origin. For a local HTTP
backend, use its development cookie configuration (`COOKIE_SECURE=false`), and
allow the exact frontend origin in its `CORS_ORIGINS` and `WS_ORIGINS`. Keep
`127.0.0.1` consistent across the frontend, backend, and allowlists.

## Configuration

Set variables in the shell or an ignored `web/.env.local` file. Restart Vite
after changes. `VITE_*` values are public and are embedded in production bundles;
never put server secrets in them.

| Variable | Purpose and default |
| --- | --- |
| `VITE_DEV_PROXY_TARGET` | Development proxy upstream, including the scheme but without `/api`; defaults to the Cloudways origin above. |
| `VITE_DEV_DIRECT_BACKEND` | Set to `true` to bypass the proxy and use `http://<browser-hostname>:8080/api` and `ws://<browser-hostname>:8080/realtime` in development. |
| `VITE_API_BASE_URL` | Explicit API base URL including `/api`; overrides the development/default API URL. |
| `VITE_WEBSOCKET_URL` | Explicit full WebSocket URL ending in `/realtime`; overrides the development/default realtime URL. |
| `VITE_TELEGRAM_BOT_USERNAME` | Telegram bot username, with or without `@`; defaults to `verificMobileMessengerIOSbot`. |

When using a custom backend directly, set both API and WebSocket URLs. Direct
requests require the backend's cookie, CORS, and WebSocket origin settings to
match the frontend. A cross-site deployment must also account for browser
third-party cookie restrictions.

Production builds default to:

- API: `https://phpstack-1634854-6489525.cloudwaysapps.com/api`
- WebSocket: `wss://phpstack-1634854-6489525.cloudwaysapps.com/realtime`

The Supabase browser helper in `src/lib/supabase/client.ts` is not connected to
the current application routes. `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are not required for the messenger's NestJS auth
flow.

## Available flows and limits

- Phone sign-in through Telegram pairing and one-time verification codes. The
  backend must have a working Telegram provider for this flow.
- Chat list, direct chat opening, existing group threads, text messages,
  editing/deleting your own messages, typing indicators, read/delivery state,
  and automatic realtime reconnection. Text sending falls back to REST if
  realtime sending is unavailable. Group creation is supported by the API
  helper but has no dedicated web UI.
- Voice recording and playback using browser-supported MP4/WebM audio.
  Recording stops at 120 seconds; the upload helper rejects empty recordings
  and recordings over 20,000,000 bytes. The backend voice/media service must be
  configured. The composer does not currently provide image attachment uploads.
- Contacts list, add/remove by phone, direct chat opening, and display name
  editing from the user menu.
- Leaflet/OpenStreetMap map with explicit share/update/stop actions. Browser
  location access is requested after a user action. The backend stores the
  latest point and enforces accepted contacts plus a separate per-contact
  sharing permission. The web UI does not yet provide contact acceptance or
  per-contact location permission controls.
- Web Push through `public/sw.js`, the browser Push API, and backend VAPID
  subscriptions. Permission is requested when the user enables notifications.
- Separate administrator sign-in and protected system dashboard. An
  administrator must be provisioned on the backend; see
  [authentication and administration](../README.md#authentication-and-administration).
- Telegram subscription plan selection with bot deep links. This screen is a
  demonstration flow; checkout and paid entitlement management are not connected.

Voice recording, geolocation, and Web Push depend on browser support and a
secure context (HTTPS or a browser-recognized local development origin). Web
Push also requires real VAPID configuration on the backend. The service worker
handles push notifications; it does not provide an offline messenger.

## Routes

| Path | Access |
| --- | --- |
| `/` | Sign-in; authenticated users are redirected to `/messenger`. |
| `/messenger` | User session required; `?chatId=<id>` selects a chat. |
| `/map` | User session required. |
| `/telegram/subscription` | Public plan selection; optional `?plan=starter`, `team`, or `business`. |
| `/admin/login` | Administrator sign-in. |
| `/admin` | Administrator session required. |
| `/system` | Redirect to `/admin`. |

## Session handling

The current backend uses HttpOnly session cookies. HTTP requests include
credentials and retry once after a successful user/admin session refresh.
User and admin sessions are restored independently on application startup.

For older backends that return a bearer token, the client retains that token
only in memory and uses the legacy HTTP/WebSocket compatibility path. It does
not persist auth tokens in `localStorage`; old user/admin storage entries are
removed at startup. The legacy WebSocket path can include a token query
parameter, so it is not equivalent to the cookie-only production contract.

Logout clears chat, realtime, and location state and attempts to detach the
Web Push subscription from the current session.

## Checks

Run from `web/` after `npm ci`:

```bash
npm run format:check
npm run contract:check
npm run lint
npm test
npm run build
npm run audit:security
```

- `format:check` verifies formatting; `npm run format` rewrites source files.
- `contract:check` checks generated Swift/TypeScript paths against
  `contracts/openapi.json`. Regenerate from the repository root with
  `node Scripts/generate-api-contract.mjs`; do not edit generated paths manually.
- `test` runs Vitest with jsdom and React Testing Library. These are unit and
  component checks; they do not prove live Telegram, push, media, or browser
  permissions work.
- `build` runs the TypeScript build check and writes the Vite bundle to `dist/`.
- `audit:security` checks production dependency advisories through the shared
  audit script and requires registry access.

To inspect a production build locally:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

Preview serves the built frontend; the development API/WebSocket proxy is not
available there. Set production API/WebSocket variables before building if the
defaults are unsuitable.

## Hosting

Serve `dist/` over HTTPS and configure history fallback to `index.html` for
client routes. Serve `/sw.js` from the origin root. Configure the backend's
allowed HTTP/WebSocket origins and secure cookies for the deployed frontend.

Build the optional frontend container from the repository root, since the build
also copies the shared iOS app icon assets:

```bash
docker build -f web/Dockerfile -t mobile-messenger-web .
docker run --rm -p 3000:3000 mobile-messenger-web
```

The Dockerfile accepts `VITE_API_BASE_URL`, `VITE_WEBSOCKET_URL`, and
`VITE_TELEGRAM_BOT_USERNAME` as `--build-arg` values. These are build-time
settings; changing container environment variables after the bundle is built
does not reconfigure the frontend. Its static server listens on `PORT` (3000
by default).

## Source layout and stack

- `src/app`: session cleanup and feature coordination.
- `src/features`: feature APIs, state, realtime, types, and UI for auth, chat,
  contacts, profile, location, push, and administration.
- `src/shared`: HTTP/auth infrastructure, generated API paths, shared state and
  types.
- `src/components`: application shell and reusable UI components.
- `src/config`: API, realtime, and Telegram configuration.
- `src/utils`: display name, contact, location, and message helpers.
- `public/sw.js`: Web Push service worker.

The client uses React 19, TypeScript 6, Vite 6, Tailwind CSS 4, Zustand 5,
React Router 7, Framer Motion, Lucide icons, and Leaflet/React Leaflet. Exact
installed versions are recorded in `package-lock.json`.

Screenshot conventions live in [docs/screenshots/README.md](../docs/screenshots/README.md).
