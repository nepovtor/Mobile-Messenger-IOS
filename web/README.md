# Mobile Messenger Web

React + TypeScript + Vite web client for the existing Mobile Messenger backend.

The web client is preconfigured for the production backend, so there is no API input screen for end users.

## Run

```bash
cd web
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Demo Accounts

- `Анна Demo` — `+15551230011` / `demo1111`
- `Борис Demo` — `+15551230012` / `demo2222`
- `Вера Demo` — `+15551230013` / `demo3333`
- `Глеб Demo` — `+15551230014` / `demo4444`
- `Даша Demo` — `+15551230015` / `demo5555`

## Demo Flow

1. Open the login screen.
2. Pick a demo account card or enter the credentials manually.
3. Open any available chat.
4. Send a message and watch it move through realtime message states.
5. Sign out to clear the session, local state, and websocket connection.
