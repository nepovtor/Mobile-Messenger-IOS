# Web Client

React + TypeScript + Vite web client for the existing Mobile Messenger backend.

The web client keeps the live backend contract, native WebSocket realtime flow, Telegram verification, location sharing, and local token storage intact. The current UI is aimed at a polished product-style experience instead of a classroom prototype.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- React Router
- Framer Motion
- lucide-react
- Leaflet / React Leaflet

## Run

```bash
cd web
npm install
npm run dev
```

The local dev server runs on `http://127.0.0.1:3000` by default and targets the local backend at `http://127.0.0.1:8080/api` unless `VITE_API_BASE_URL` or `VITE_WEBSOCKET_URL` override it.

## Checks

```bash
npm run format
npm run lint
npm test
npm run build
```

## Main Flows

1. Enter a phone number in international format such as `+375291234567`.
2. Link Telegram and send your own contact to the bot.
3. Request the one-time code and verify the session.
4. Continue into the messenger workspace, contacts rail, and shared map.
5. Use the separate admin console for protected system routes.

The UI does not expose the API URL, JWT, or raw debug payloads beyond the auth flow hints needed for development providers.

## Screenshots To Capture

- `login hero`
- `messenger layout`
- `chat thread`
- `contacts rail`
- `profile panel`
- `map workspace`
- `admin console`

If screenshots are not available yet, add the real images later under `docs/screenshots/` instead of committing empty placeholder files.
