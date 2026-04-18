# Mobile Messenger iOS

Минимальный рабочий репозиторий с двумя частями:

- `MobileMessengerIOS/` и `MobileMessengerIOS.xcodeproj/` — iOS-клиент на SwiftUI.
- `server/` — локальный backend на NestJS + PostgreSQL + MinIO.

В репозитории сейчас нет Tailwind, web-фронтенда и CocoaPods. README ниже описывает только то, что реально существует и запускается.

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

Debug-конфигурация по умолчанию смотрит в публичный backend, а не в `localhost`.

- Базовый debug endpoint задается в `MobileMessengerIOS/Configurations/Debug.xcconfig`.
- Локальная разработка через публичный tunnel генерирует файл `MobileMessengerIOS/Configurations/Debug.public.xcconfig`, который переопределяет debug endpoint.
- После `make up` приложение будет использовать публичный Cloudflare tunnel URL вида `https://...trycloudflare.com/api`.

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

Полный локальный flow с публичным endpoint:

```bash
make up
```

Команда:

- поднимет backend и инфраструктуру;
- откроет публичный Cloudflare tunnel;
- сгенерирует `Debug.public.xcconfig` для iOS, чтобы debug-сборка использовала публичный URL вместо локального.

## Демо-авторизация

Локальный backend в development-режиме автоматически подготавливает демо-аккаунты:

- `+15551230011` / `demo1111` — Анна Demo
- `+15551230012` / `demo2222` — Борис Demo

Для входа по коду подтверждения backend теперь генерирует одноразовый debug-код и, если в `.env` включен `AUTH_EXPOSE_DEBUG_CODE=true`, возвращает его в ответе `POST /api/auth/request`.

Безопасные флаги окружения для backend:

- `JWT_SECRET` обязателен и больше не имеет fail-open fallback.
- `DB_SYNCHRONIZE` управляет авто-синхронизацией схемы и по умолчанию предназначен только для локальной разработки.
- `AUTH_ENABLE_DEMO_ACCOUNTS`, `AUTH_ALLOW_PASSWORD_LOGIN`, `AUTH_EXPOSE_DEBUG_CODE` позволяют держать демо-поведение только в local/dev.
- `CORS_ORIGINS` ограничивает список разрешенных браузерных origin вместо полностью открытого CORS.

## Тесты

iOS unit-тесты:

```bash
xcodebuild \
  -project MobileMessengerIOS.xcodeproj \
  -scheme MobileMessengerIOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Backend e2e:

```bash
cd server
npm install
npm test
```

## GitHub / CI

- В git должны храниться только исходники и нужные проектные файлы.
- Пользовательские Xcode-артефакты, `.DS_Store`, локальные `.env`, `build/`, `server/dist/` и `server/node_modules/` игнорируются.
- Сгенерированный `MobileMessengerIOS/Configurations/Debug.public.xcconfig` не хранится в git и пересоздается через `make configure-ios` / `make up`.
- GitHub Actions теперь запускает iOS unit-тесты и backend pipeline: `lint` + `e2e` + `build`.
