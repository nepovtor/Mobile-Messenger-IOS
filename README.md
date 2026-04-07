# 🚀 Mobile Messenger iOS

![Platform](https://img.shields.io/badge/platform-iOS_15+-blueviolet?style=for-the-badge) ![Swift](https://img.shields.io/badge/swift-5.9-orange?style=for-the-badge) ![SwiftUI](https://img.shields.io/badge/UI-SwiftUI%20%2B%20UIKit-ff69b4?style=for-the-badge) ![Status](https://img.shields.io/badge/status-Active-success?style=for-the-badge)

> **Гипербыстрый и стильный мессенджер для тех, кто любит общаться красиво.**

Добро пожаловать в репозиторий мобильного мессенджера под iOS. Здесь мы строим современное приложение для мгновенного обмена сообщениями, звонков и совместной работы — с акцентом на безопасность, гибкость и эстетичный интерфейс.

---

## 🎨 Дизайн & UX

### Регистрация
- **Красивый экран приветствия** с градиентным фоном
- **Простая форма** с полями "Имя" и "Номер телефона"
- **Современная кнопка** с градиентом и анимацией
- **Валидация полей** в реальном времени

### Список чатов
- **Градиентная шапка** с заголовком и подзаголовком
- **Красивые аватары** с градиентными фонами
- **Карточки чатов** с тенями и закругленными углами
- **Индикатор печати** с анимированными точками
- **Бейджи непрочитанных** сообщений

### Профиль
- **Большой аватар** в шапке с градиентом
- **Организованные настройки** с иконками
- **Кнопка выхода** с предупреждением

### Цветовая палитра
- **Основной цвет**: Синий градиент (от `#007AFF` до `#5856D6`)
- **Акценты**: Фиолетовый для второстепенных элементов
- **Фон**: Адаптивный под системную тему

---

## ✨ Что делает приложение особенным
- 💬 Ультрабыстрые чаты тет-а-тет и мультиформатные групповые беседы.
- 🔐 Сквозное шифрование личных сообщений и медиа.
- 📞 Голосовые и видеозвонки с адаптацией качества под сеть.
- 🎙️ Голосовые сообщения, пересылка файлов, фото и реакций.
- 🔔 Гибкие уведомления, «Не беспокоить» и умные mute-правила.
- 🌓 Автовыбор светлой/тёмной темы и настраиваемые палитры.
- 🌍 Локализация интерфейса (RU / EN) и готовность к расширению.

## 🧠 Архитектура & стек
| Слой | Стек |
| ---- | ---- |
| Ядро | Swift 5+, Combine, async/await |
| UI | SwiftUI + UIKit (гибридный подход) |
| Сеть | URLSession, WebSocket, Network.framework |
| Данные | CoreData, Keychain, UserDefaults |
| Пуши | Firebase Cloud Messaging, APNs |
| CI/CD | Xcode Cloud, Fastlane, GitHub Actions |

> ⚙️ Минимальная iOS: **15.0**. Собирается в Xcode 15+ на macOS 13 Ventura и выше.

## 🗂 Структура проекта
```
Mobile-Messenger-IOS/
├── App/                  # SwiftUI сцены, UIKit контейнеры, навигация
├── Core/                 # Use Cases, бизнес-правила, DI-контейнер
├── Data/                 # API-клиенты, WebSocket, репозитории данных
├── Resources/            # Ассеты, локализации, конфиги
├── Tests/                # Unit, Snapshot и UI тесты
├── Scripts/              # Fastlane, утилиты сборок, pre-commit хуки
└── README.md             # Документация проекта
```

---

## 🚦 Как запустить (подробный гайд)

> Готовый блок, который можно вставить в README. Настроен так, чтобы даже новичок прошёл путь без лишних сюрпризов.

### Требования

* macOS 12+
* **Xcode 15.0+** (для SwiftData/iOS 17)
* (Опционально) **Homebrew** и **CocoaPods**, если в проекте есть `Podfile`

### Установка Xcode

1. Откройте **App Store** → установите **Xcode** → запустите его один раз, соглашайтесь с лицензией.
2. Убедитесь, что версия Xcode ≥ **15.0**.

### Клонирование проекта

```bash
git clone https://github.com/nepovtor/Mobile-Messenger-IOS.git
cd Mobile-Messenger-IOS
```

### Зависимости

#### Вариант A — **без CocoaPods** (нет `Podfile`)

Ничего ставить не нужно: SPM подтянет зависимости автоматически при сборке.

#### Вариант B — **с CocoaPods** (есть `Podfile`)

1. Установите Homebrew (если нет):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Установите CocoaPods:

```bash
brew install cocoapods
pod --version   # должно показать номер версии
```

3. В корне проекта выполните:

```bash
pod install
```

4. Открывайте **`.xcworkspace`**, а не `.xcodeproj`.

> Если при `pod install` получите SSL-ошибку (self-signed cert) — попробуйте другую сеть (домашний Wi-Fi/мобильный хот-спот). Часто это из-за корпоративного прокси (Ubiquiti/ZScaler). После смены сети запустите команду ещё раз.

### Конфигурация окружения

Скопируйте пример конфигурации и укажите собственные ключи и эндпоинты (при необходимости уточните их у команды):

```bash
cp Config/Config.example.xcconfig Config/Config.xcconfig
```

### Открытие в Xcode

* Если использовали CocoaPods: откройте `MobileMessengerIOS.xcworkspace`.
* Если нет Podfile: откройте `MobileMessengerIOS.xcodeproj`.

### Запуск в симуляторе

1. В верхней панели Xcode выберите **Scheme**: `MobileMessengerIOS`.
2. Рядом выберите симулятор (например, **iPhone 15 Pro**).
3. Нажмите ▶ (**Run**) или `Cmd + R`.

### Запуск на реальном устройстве (опционально)

1. Подключите iPhone по кабелю → нажмите **Trust** на устройстве.
2. Xcode → **Settings → Accounts** → добавьте свой Apple ID.
3. В Project Navigator → выберите **Target `MobileMessengerIOS` → Signing & Capabilities** → выберите **Team**.
4. Выберите свой iPhone в списке устройств → **Run**.

### Подсказки и решение проблем

* Очистить кэш сборки: **Product → Clean Build Folder** (`Cmd + Shift + K`), затем снова **Run**.
* Если `pod` не найден: закройте и откройте Terminal; при необходимости добавьте `/opt/homebrew/bin` в `PATH`:

  ```bash
  echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
  ```

* Если не запускается из-за подписи: включите **Automatically manage signing** и выберите **Team**.
* Если Xcode ругается на iOS-версию симулятора: выберите устройство с iOS **17+**.
* Если SPM завис: **File → Packages → Reset Package Caches**.

----

## 🏁 Быстрый старт для опытных
1. Клонируйте репозиторий и перейдите в папку проекта.
2. Откройте `MobileMessengerIOS.xcworkspace` или `MobileMessengerIOS.xcodeproj` (в зависимости от наличия CocoaPods).
3. Выберите схему `MobileMessengerIOS` и запустите на симуляторе или устройстве.
4. Создайте `Config.xcconfig` из примера и пропишите секреты.

----

## 🧪 Тестирование качества
- **Unit**: `Cmd + U` или
  ```bash
  xcodebuild test -scheme MobileMessenger -destination 'platform=iOS Simulator,name=iPhone 15'
  ```
- **UI / Snapshot**: запускайте из Xcode или через `xcodebuild test` с нужной схемой.
- **Static Analysis**: SwiftLint + SwiftFormat (рекомендуется добавить в pre-commit).

## 🛠️ Серверная разработка
В репозитории добавлен рабочий каркас backend'а (NestJS) в папке `server/`. Он закрывает базовую инфраструктуру для интеграции с мобильным клиентом и может запускаться локально.

### Минимальный стек
- **TypeScript + NestJS** для HTTP/WebSocket API.
- **PostgreSQL** для персистентных данных (чаты, пользователи, ACL).
- **Redis** как кэш и брокер для эфемерных данных (сессии, rate limit, Presence).
- **Kafka** (Redpanda) для асинхронных событий (доставка сообщений, fanout уведомлений).
- **S3-совместимое хранилище** (MinIO) для медиа.
- **OpenAPI 3.1** для контрактов клиента и автогенерации моделей.

### Быстрый старт локально
1. **Поднимите инфраструктуру в Docker** (PostgreSQL, Redis, MinIO, Kafka/Redpanda):
   ```bash
   docker compose -f server/docker-compose.dev.yml up -d
   ```
2. **Настройте переменные окружения**:
   ```bash
   cd server
   cp .env.example .env
   ```
3. **Установите зависимости** (Node 20+, pnpm):
   ```bash
   pnpm install
   ```
4. **Запустите backend в watch-режиме**:
   ```bash
   pnpm run start:dev
   ```
5. **Проверьте точки входа**:
   - REST префикс: `http://localhost:8080/api`
   - Healthcheck: `GET http://localhost:8080/api/health`
   - Версия сборки: `GET http://localhost:8080/api/version`

### Базовые модули
- **Auth**: OAuth2/Password, refresh токены, 2FA, сессии в Redis (заготовлено в инфраструктуре).
- **Messaging**: REST для CRUD диалогов, WebSocket для real-time доставки; idempotency ключи для повтора отправок.
- **Media**: загрузка файлов с прямой выдачей pre-signed URL из MinIO/S3.
- **Notifications**: Fanout в FCM/APNs, topic- и user-level подписки, настройка quiet hours.

### Практики для команды
- Контрактный подход: сначала OpenAPI/AsyncAPI, затем реализация.
- Фича-флаги для безопасных выкатов и A/B.
- Набор обязательных линтеров: **ESLint**, **Prettier**, **commitlint**.
- Автотесты: **Jest** + **supertest** для REST, **ws** для WebSocket.
- Наблюдаемость: **OpenTelemetry** трейсинг + метрики Prometheus, логирование в JSON.

## 🔄 CI/CD потоки
1. Install deps → Lint → Tests → Build IPA → Upload TestFlight.
2. Пример `Fastlane`:
   ```ruby
   lane :beta do
     match(type: "appstore")
     build_app(scheme: "MobileMessenger")
     upload_to_testflight
   end
   ```
3. Для GitHub Actions доступен шаблон workflow `ci.yml` (создайте при необходимости).

## 🛡 Безопасность
- SSL pinning, ATS без лишних исключений.
- Keychain для секретов и токенов.
- Регулярное обновление зависимостей и автоматические проверки.
- Поддержка безопасного входа по Face ID / Touch ID.

## 🤝 Вклад и комьюнити
1. Форкните репозиторий и создайте ветку `feature/your-feature`.
2. Реализуйте изменения, добавьте тесты, обновите документацию.
3. Убедитесь, что линтеры и тесты зелёные.
4. Оформите Pull Request со скриншотами UI, если затронут визуал.

> Мы любим содержательные review: прикладывайте демо-видео, заметки по UX и артефакты тестов.

## 🆘 Поддержка
- Issues в GitHub — для вопросов и багов.
- Срочные инциденты — команда в Slack/Teams.
- Дополнительные материалы — раздел `Docs/` и Notion-хаб проекта.

## 📄 Лицензия
Укажите выбранную лицензию (например, MIT, Apache 2.0) в `LICENSE`.

---

Создаём мессенджер, которым хочется пользоваться каждый день. Врывайтесь! 💜
