# Лабораторные работы 7–11 в проекте Mobile Messenger

## Какие 5 лаб сделаны

В этом проекте  реализованы и оформлены 5 лабораторных работ:

1. `Lab 5` — TypeScript
2. `Lab 6` — Logging & Error Handling
3. `Lab 7` — Docker Basics
4. `Lab 8` — PostgreSQL & TypeORM
5. `Lab 9-10` — Authentication & JWT

Это прямо указано в разделе `Laboratory Compliance` в [README.md](../README.md).

## Где это видно в проекте

Основная реализация лабораторных находится в серверной части:

- `server/` — основной код для лаб 7–11
- `server/src/modules/system/` — защищённые эндпоинты обзора и логов
- `web/src/pages/SystemPage.tsx` — веб-панель, где эти лабораторные показываются визуально
- `server/test/` — e2e- и unit-тесты, подтверждающие реализацию

Ниже по каждой лабе отдельно расписано, что именно сделано, как это работает и где смотреть.

---

## Lab 7 — TypeScript

### Что сделано

Для backend-части включён строгий режим TypeScript и настроен ESLint, чтобы код соответствовал требованиям лабораторной по типизации и качеству кода.

### Где сделано

- `server/tsconfig.json`
- `server/.eslintrc.json`
- `server/package.json`
- `server/src/modules/system/system.service.ts`

### Как сделано

В `server/tsconfig.json` включены строгие проверки:

- `strict`
- `noImplicitAny`
- `noUnusedLocals`
- `noUnusedParameters`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`
- `noUncheckedIndexedAccess`
- `noPropertyAccessFromIndexSignature`
- `target: ES2022`
- `module: Node16`

В `server/.eslintrc.json` подключены:

- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `plugin:prettier/recommended`

Также явно запрещён `any` через правило:

- `@typescript-eslint/no-explicit-any: error`

В `server/package.json` есть команды для проверки:

- `npm run lint`
- `npm run build`

Дополнительно в `server/src/modules/system/system.service.ts` backend сам читает `tsconfig.json` и отдаёт в `/api/system/overview` сведения о TypeScript-конфигурации. Эти данные отображаются в веб-панели `web/src/pages/SystemPage.tsx`.

### Что это даёт

- ошибки типов ловятся на этапе сборки
- код backend-а остаётся строго типизированным
- настройки TypeScript можно показать преподавателю не только в коде, но и через системную панель

### Как проверить

```bash
cd server
npm run lint
npm run build
```

---

## Lab 8 — Logging & Error Handling

### Что сделано

В проекте реализованы:

- логирование HTTP-запросов
- логирование ошибок
- единый глобальный обработчик исключений
- обработка `uncaughtException`
- обработка `unhandledRejection`
- маскирование чувствительных данных в логах

### Где сделано

- `server/src/modules/common/app-logger.ts`
- `server/src/modules/common/global-exception.filter.ts`
- `server/src/main.ts`
- `server/logs/requests.log`
- `server/logs/errors.log`
- `server/logs/app.log`
- `server/src/modules/system/system.controller.ts`
- `server/src/modules/system/system.service.ts`
- `web/src/pages/SystemPage.tsx`

### Как сделано

В `app-logger.ts` сделан единый логгер, который:

- пишет обычные события в `app.log`
- пишет HTTP-запросы в `requests.log`
- пишет ошибки в `errors.log`

Там же есть:

- `createRequestLoggingMiddleware()` — middleware для логирования каждого HTTP-запроса
- `registerProcessErrorHandlers()` — регистрация process-level обработчиков ошибок
- `sanitizeLogValue()` — очистка логов от чувствительных полей вроде `password`, `token`, `secret`, `authorization`

В `global-exception.filter.ts` реализован глобальный фильтр, который:

- перехватывает `HttpException`
- отдельно логирует серверные ошибки `5xx`
- приводит ответы об ошибках к нормализованному JSON-виду
- отдаёт безопасный `500 Internal server error`, если произошла непредвиденная runtime-ошибка

В `server/src/main.ts` всё это реально подключено:

- регистрируются process handlers
- подключается request logging middleware
- включается `GlobalExceptionFilter`

В `server/src/modules/system/system.controller.ts` и `system.service.ts` есть защищённые эндпоинты:

- `/api/system/overview`
- `/api/system/logs/requests`
- `/api/system/logs/errors`

Через них логи и сводка по системе выводятся в `web/src/pages/SystemPage.tsx`.

### Что это даёт

- можно показать факт логирования не только кодом, но и живыми логами
- ошибки не падают в сыром виде наружу
- секреты и пароли не должны утекать в лог-файлы
- есть готовая админская страница для демонстрации лабы

### Как проверить

```bash
cd server
npm run start:dev
curl http://127.0.0.1:8080/api/health
tail -n 5 logs/requests.log
tail -n 5 logs/errors.log
```

---

## Lab 9 — Docker Basics

### Что сделано

Для backend-а собрана полноценная Docker-инфраструктура:

- production-like compose
- development compose с hot reload
- PostgreSQL в контейнере
- pgAdmin в контейнере
- отдельные volume для БД, pgAdmin и логов
- healthcheck базы
- ожидание готовности PostgreSQL перед стартом backend-а
- отдельная bridge-сеть

### Где сделано

- `server/docker-compose.yml`
- `server/docker-compose.dev.yml`
- `server/Dockerfile`
- `Dockerfile`
- `server/.env.example`
- `server/src/modules/system/system.service.ts`

### Как сделано

В `server/docker-compose.yml` описаны сервисы:

- `backend`
- `postgres`
- `pgadmin`

Особенно важно, что:

- backend зависит от `postgres` через `depends_on`
- используется `condition: service_healthy`
- у PostgreSQL есть `healthcheck` через `pg_isready`
- логи backend-а вынесены в volume `backend_logs`
- БД хранится в `postgres_data`
- pgAdmin хранит данные в `pgadmin_data`
- всё подключено к сети `messenger_network`

В production-like compose backend стартует так:

```bash
npm run migration:run:dist && npm run start
```

То есть перед запуском приложения автоматически применяются миграции.

В `server/docker-compose.dev.yml` оставлен dev-режим:

- `NODE_ENV=development`
- `DB_SYNCHRONIZE=true`
- команда `npm run start:dev`
- примонтирован весь проект для hot reload

В `server/src/modules/system/system.service.ts` backend дополнительно проверяет наличие Docker-файлов и отдаёт эту информацию в системную панель.

### Что это даёт

- проект можно быстро поднять целиком контейнерами
- dev- и production-сценарии разделены
- инфраструктура наглядно соответствует требованиям лабораторной

### Как проверить

```bash
docker compose -f server/docker-compose.yml up --build
docker compose -f server/docker-compose.yml down
```

Для режима разработки:

```bash
docker compose -f server/docker-compose.dev.yml up --build
docker compose -f server/docker-compose.dev.yml down
```

---

## Lab 10 — PostgreSQL & TypeORM

### Что сделано

В проекте backend работает через PostgreSQL и TypeORM, причём лабораторный путь сделан через миграции, а не только через `synchronize`.

### Где сделано

- `server/src/database/data-source.ts`
- `server/src/database/database.config.ts`
- `server/src/database/entities.ts`
- `server/src/database/migrations/20260512000000-InitialLabComplianceMigration.ts`
- `server/src/entities/*.ts`
- `server/package.json`
- `server/docker-compose.yml`

### Как сделано

В `server/src/database/data-source.ts` создаётся `AppDataSource`, который используется TypeORM CLI.

В `server/src/database/database.config.ts` собрана единая конфигурация БД:

- тип БД: `postgres`
- чтение настроек из env
- подключение списка entity
- подключение миграций из `server/src/database/migrations`
- выбор режима `synchronize` через runtime config

В `server/package.json` добавлены отдельные команды для миграций:

- `migration:generate`
- `migration:run`
- `migration:run:dist`
- `migration:revert`
- `migration:show`

Ключевой файл лабы — `server/src/database/migrations/20260512000000-InitialLabComplianceMigration.ts`.
В нём создаются основные таблицы проекта:

- `admins`
- `users`
- `phone_verification_codes`
- `telegram_links`
- `telegram_pairing_tokens`
- `chats`
- `location_shares`
- `media`
- `chat_participants`
- `messages`
- `contacts`
- `push_subscriptions`

Также в этой миграции:

- создаются индексы
- создаются внешние ключи и ограничения
- seed-ится администратор `admin/admin`

В `server/src/entities/` лежат TypeORM Entity для этих таблиц. Например:

- `user.entity.ts`
- `chat.entity.ts`
- `message.entity.ts`
- `contact.entity.ts`
- `admin.entity.ts`

### Что это даёт

- структура БД описана в коде и воспроизводима
- можно поднимать БД через миграции
- есть разделение между dev-режимом и лабораторно-правильным режимом

### Как проверить

```bash
cd server
npm run migration:show
npm run migration:run
npm run migration:revert
```

---

## Lab 11 — Authentication & JWT

### Что сделано

В проекте реализована полноценная аутентификация с JWT для пользователей и отдельная admin-аутентификация для системной панели.

### Где сделано

- `server/src/modules/auth/auth.service.ts`
- `server/src/modules/auth/auth.guard.ts`
- `server/src/modules/auth/login.controller.ts`
- `server/src/modules/auth/auth.controller.ts`
- `server/src/modules/auth/decorators/public.decorator.ts`
- `server/src/modules/auth/decorators/skip-user-auth.decorator.ts`
- `server/src/modules/users/users.controller.ts`
- `server/src/modules/users/users.service.ts`
- `server/src/entities/user.entity.ts`
- `server/src/modules/admin/admin.controller.ts`
- `server/src/modules/admin/admin.service.ts`
- `server/src/modules/admin/admin.guard.ts`
- `server/src/entities/admin.entity.ts`
- `server/src/modules/app.module.ts`
- `server/src/database/migrations/20260512000000-InitialLabComplianceMigration.ts`
- `server/test/auth-chat-media.e2e.test.ts`
- `server/test/admin-system.e2e.test.ts`
- `web/src/pages/AdminLoginPage.tsx`
- `web/src/pages/SystemPage.tsx`

### Как сделано

#### Пользовательская авторизация

В `server/src/modules/users/users.controller.ts` есть публичный endpoint:

- `POST /api/users`

Он создаёт пользователя через `UsersService`.

В `server/src/modules/users/users.service.ts`:

- логин нормализуется
- валидируется `displayName`
- пароль хешируется через `authService.hashPassword()`
- в БД сохраняется `passwordHash`, а не исходный пароль

В `server/src/modules/auth/auth.service.ts`:

- `hashPassword()` использует `bcrypt`
- `authenticateUserByLogin()` ищет пользователя по `login`
- пароль сравнивается через `compare(...)`
- `loginLabUser()` возвращает JWT через `POST /api/login`
- `buildAuthResult()` формирует JWT payload

В JWT для пользователя кладутся:

- `sub`
- `login`
- `displayName`
- `contact`
- `method`
- `phone`

В `server/src/modules/auth/login.controller.ts` есть публичный endpoint:

- `POST /api/login`

В `server/src/modules/auth/auth.guard.ts` реализована проверка Bearer JWT:

- токен читается из `Authorization`
- валидируется через `JwtService`
- после этого дополнительно проверяется, что пользователь реально существует в БД
- если пользователя уже нет, возвращается `403`

В `server/src/modules/app.module.ts` `AuthGuard` подключён глобально через `APP_GUARD`, поэтому по умолчанию маршруты защищены, а публичные исключения оформляются декораторами `@Public()` и `@SkipUserAuth()`.

#### Admin-аутентификация

Для системной панели сделан отдельный admin-контур:

- `POST /api/admin/login`
- `GET /api/admin/me`
- `GET /api/system/overview`
- `GET /api/system/logs/requests`
- `GET /api/system/logs/errors`

В `server/src/modules/admin/admin.service.ts`:

- админ ищется в таблице `admins`
- пароль админа тоже сравнивается через `bcrypt`
- при успехе выдаётся отдельный JWT с ролью `admin`

В `server/src/modules/admin/admin.guard.ts`:

- проверяется Bearer token
- проверяется роль `admin`
- проверяется наличие админа в БД или допустимый fallback-конфиг

В миграции `20260512000000-InitialLabComplianceMigration.ts` сидируется администратор:

- login: `admin`
- password: `admin`

#### Демонстрация через web

В `web/src/pages/AdminLoginPage.tsx` сделан вход в admin workspace.

В `web/src/pages/SystemPage.tsx` сделана защищённая страница, которая:

- показывает сводку по TypeScript
- показывает Docker и database-инфраструктуру
- показывает JWT/session-информацию
- показывает request/error logs
- тем самым служит визуальной демонстрацией лаб 7–11

### Что это даёт

- есть реальная JWT-аутентификация, а не заглушка
- пароль в БД хранится в виде hash
- защита маршрутов сделана централизованно
- есть отдельный защищённый admin-контур для обзорной лабораторной панели

### Как проверить

Создание лабораторного пользователя:

```bash
curl -X POST http://127.0.0.1:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"login":"student","password":"secret123","displayName":"Student User"}'
```

Вход и получение JWT:

```bash
curl -X POST http://127.0.0.1:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"login":"student","password":"secret123"}'
```

Проверка защищённого маршрута:

```bash
TOKEN="<jwt_token>"
curl http://127.0.0.1:8080/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Какие тесты это подтверждают

В `server/test/auth-chat-media.e2e.test.ts` есть тест:

- создание lab user
- проверка, что пароль хранится как hash
- логин через `/api/login`
- доступ к `/api/auth/me`

В `server/test/admin-system.e2e.test.ts` есть тесты:

- отдельный admin login
- доступ к `/api/admin/me`
- доступ к `/api/system/overview`
- запрет для обычного user JWT на admin-only маршруты

---

## Дополнительно: где удобнее всего показывать преподавателю

Если нужна быстрая демонстрация именно лабораторных, то самые удобные точки входа такие:

1. `README.md` — официальный список лаб 7–11
2. `web/src/pages/SystemPage.tsx` — визуальная панель обзора
3. `server/src/modules/system/system.service.ts` — серверная сводка по TypeScript, Docker, БД, JWT и логам
4. `server/test/auth-chat-media.e2e.test.ts` и `server/test/admin-system.e2e.test.ts` — автоматические подтверждения

## Короткий вывод

В этом проекте сделаны именно 5 лабораторных работ: `7`, `8`, `9`, `10`, `11`.
Основная реализация находится в `server/`, а для наглядной демонстрации добавлена отдельная защищённая web-панель в `web/src/pages/SystemPage.tsx`.
