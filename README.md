# Mobile Messenger iOS

Минимальный рабочий репозиторий с двумя частями:

- `MobileMessengerIOS/` и `MobileMessengerIOS.xcodeproj/` — iOS-клиент на SwiftUI.
- `server/` — локальный backend на NestJS + PostgreSQL + MinIO.

В репозитории сейчас нет Tailwind, web-фронтенда, CocoaPods и iOS test target. README ниже описывает только то, что реально существует и запускается.

## Структура

```text
Mobile-Messenger-IOS/
├── .github/workflows/swift.yml
├── MobileMessengerIOS/
├── MobileMessengerIOS.xcodeproj/
├── server/
│   ├── docker-compose.dev.yml
│   ├── package.json
│   └── src/
└── README.md
```

## Требования

- macOS с установленным Xcode
- Node.js 20+
- Docker Desktop

## Backend

Локальная инфраструктура:

- PostgreSQL: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Запуск:

```bash
make server
```

Команда из корня репозитория сама:

- поднимет PostgreSQL и MinIO через Docker Compose;
- создаст `server/.env` из `server/.env.example`, если файла ещё нет;
- установит зависимости `server/`, если они ещё не установлены;
- запустит backend в dev-режиме.

Ручной эквивалент:

```bash
docker compose -f server/docker-compose.dev.yml up -d
cd server
cp .env.example .env
npm install
npm run start:dev
```

Проверка:

- `GET http://localhost:8080/api/health`
- `GET http://localhost:8080/api/version`

## iOS-приложение

Debug-конфигурация уже настроена на локальный backend:

- `REST_BASE_URL = http://127.0.0.1:8080/api`

Запуск из Xcode:

1. Откройте `MobileMessengerIOS.xcodeproj`.
2. Выберите схему `MobileMessengerIOS`.
3. Выберите любой iPhone Simulator.
4. Нажмите `Run`.

Проверка сборки из терминала:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## Демо-авторизация

Локальный backend автоматически подготавливает демо-аккаунты:

- `+15551230011` / `demo1111` — Анна Demo
- `+15551230012` / `demo2222` — Борис Demo

Для входа по коду подтверждения:

- код: `1111`

## GitHub / CI

- В git должны храниться только исходники и нужные проектные файлы.
- Пользовательские Xcode-артефакты, `.DS_Store`, локальные `.env`, `build/`, `server/dist/` и `server/node_modules/` игнорируются.
- GitHub Actions сейчас проверяет реальную вещь: сборку iOS-приложения. Отдельного test target в проекте пока нет.
