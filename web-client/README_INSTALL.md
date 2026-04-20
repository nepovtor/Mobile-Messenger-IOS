# Куда ставить в проект и как запускать

## Рекомендуемое размещение в вашем репозитории

Положите папку как отдельный frontend рядом с backend:

```text
Mobile-Messenger-IOS/
├── MobileMessengerIOS/          # iOS-клиент
├── server/                      # NestJS backend
├── web-client/                  # сюда положить эти файлы
│   ├── package.json
│   ├── index.html
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       └── styles.css
└── README.md
```

## Что именно делает этот web-client

Клиент рассчитан на те же backend-маршруты, которые используются в iOS-проекте:

- `POST /auth/request`
- `POST /auth/verify`
- `POST /auth/login`
- `GET /auth/contacts`
- `GET /chats`
- `POST /chats`
- `GET /chats/:chatId/messages`
- `POST /chats/:chatId/messages`
- `GET /health`

## Как подключить к backend

По умолчанию в интерфейсе стоит адрес:

```text
http://localhost:8080/api
```

Это соответствует вашему backend из `server/`, если он поднимается локально на 8080 и использует REST-префикс `/api`.

Если backend работает по другому адресу, измените поле **REST base URL** в интерфейсе.

## Пошаговый запуск

### 1. Скопировать файлы

Скопируйте содержимое этой папки в:

```text
Mobile-Messenger-IOS/web-client/
```

### 2. Запустить backend

Из папки `server/`:

```bash
npm install
npm run start:dev
```

### 3. Запустить web-client

Из папки `web-client/`:

```bash
npm install
npm run dev
```

После этого Vite поднимет frontend, обычно на адресе:

```text
http://localhost:4173
```

## Если backend не пускает запросы из браузера

Нужно включить CORS в NestJS.

В `server/src/main.ts` добавьте или проверьте:

```ts
app.enableCors({
  origin: ['http://localhost:4173', 'http://127.0.0.1:4173'],
  credentials: true,
});
```

## Что уже реализовано

- авторизация по паролю
- регистрация/подтверждение по коду
- demo-аккаунты
- загрузка контактов
- открытие личного чата из контактов
- список чатов
- создание группового чата
- загрузка истории сообщений
- отправка текстовых сообщений
- отображение message status
- индикация состояния соединения

## Что можно добавить следующим этапом

- загрузку изображений через `/media/upload-url` и `/media/:id/confirm`
- polling или websocket/realtime слой
- mark as read через `/chats/:chatId/messages/:messageId/read`
- typing indicator через `/chats/:chatId/typing`
