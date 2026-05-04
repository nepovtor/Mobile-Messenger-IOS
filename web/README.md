# Web Client

React + TypeScript + Vite web client for the existing Mobile Messenger backend.

The web client keeps the live backend contract, native WebSocket realtime flow, Telegram verification, demo accounts, and local token storage intact. The UI is polished for coursework defense, but it does not introduce mocks or fake features.

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

## Checks

```bash
npm run format
npm run lint
npm test
npm run build
```

## Demo Accounts

- `Анна Demo` — `+15551230011` / `demo1111`
- `Борис Demo` — `+15551230012` / `demo2222`
- `Вера Demo` — `+15551230013` / `demo3333`
- `Глеб Demo` — `+15551230014` / `demo4444`
- `Даша Demo` — `+15551230015` / `demo5555`

## Demo Flow

1. Open the landing page and use the `Demo guide` hint if needed.
2. Login as `Анна Demo` from the one-click demo cards.
3. Open a chat thread and send a realtime message.
4. Switch to Contacts to show add-by-phone and direct chat opening.
5. Switch to Map to show privacy-first location sharing.

## Real Login Flow

1. Enter a phone number in international format such as `+375291234567`.
2. Click `Привязать Telegram`.
3. Send your own contact to the Telegram bot.
4. Return to the web client, click `Получить код`, then `Подтвердить`.

The UI does not expose the API URL, JWT, or debug payloads.

## Screenshots To Capture

- `login hero`
- `messenger layout`
- `chat thread`
- `contacts`
- `profile`
- `map`

If screenshots are not available yet, add the real images later under `docs/screenshots/` instead of committing empty placeholder files.
