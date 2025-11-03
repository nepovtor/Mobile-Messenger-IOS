# 🚀 Mobile Messenger iOS

![Platform](https://img.shields.io/badge/platform-iOS_15+-blueviolet?style=for-the-badge) ![Swift](https://img.shields.io/badge/swift-5.9-orange?style=for-the-badge) ![SwiftUI](https://img.shields.io/badge/UI-SwiftUI%20%2B%20UIKit-ff69b4?style=for-the-badge) ![Status](https://img.shields.io/badge/status-Active-success?style=for-the-badge)

> **Гипербыстрый и стильный мессенджер для тех, кто любит общаться красиво.**

Добро пожаловать в репозиторий мобильного мессенджера под iOS. Здесь мы строим современное приложение для мгновенного обмена сообщениями, звонков и совместной работы — с акцентом на безопасность, гибкость и эстетичный интерфейс.

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

## 👶 Для тех, кто впервые запускает iOS-проект
**Не переживай, всё просто — повторяй шаги по порядку.**

1. **Проверь, что у тебя есть нужный софт**
   - Mac с macOS 13 Ventura или свежее.
   - [Xcode](https://apps.apple.com/ru/app/xcode/id497799835) 15 или выше (скачай из App Store).
   - Apple ID для входа в Xcode (бесплатного достаточно).

2. **Установи инструменты командной строки** (один раз)
   ```bash
   xcode-select --install
   ```

3. **Клонируй репозиторий**
   ```bash
   git clone https://github.com/<your-org>/Mobile-Messenger-IOS.git
   cd Mobile-Messenger-IOS
   ```

4. **Подтяни зависимости**
   - Swift Package Manager: просто открой проект в Xcode — пакеты притянутся сами.
   - Если используем CocoaPods:
     ```bash
     sudo gem install cocoapods
     pod install
     ```

5. **Скопируй конфиги**
   ```bash
   cp Config/Config.example.xcconfig Config/Config.xcconfig
   ```
   Открой новый файл и впиши свои API-ключи, адреса WebSocket и параметры Firebase (при необходимости попроси у команды доступы).

6. **Запусти проект**
   ```bash
   open MobileMessenger.xcworkspace
   ```
   В выпадающем меню схем выбери `MobileMessenger`, затем жми ▶️ (Cmd + R) и жди, пока приложение поднимется в симуляторе или на подключённом устройстве.

7. **Если что-то пошло не так**
   - Проверь, что выбрана актуальная версия Xcode.
   - Очисти кеши через `Shift + Cmd + K` и перезапусти сборку.
   - Загляни в раздел [🆘 Поддержка](#-поддержка) и напиши в чат команды.

---

## 🏁 Быстрый старт для опытных
1. Клонируйте репозиторий и перейдите в папку проекта.
2. Откройте `MobileMessenger.xcworkspace`.
3. Выберите схему `MobileMessenger` и запустите на симуляторе или устройстве.
4. Создайте `Config.xcconfig` из примера и пропишите секреты.

---

## 🧪 Тестирование качества
- **Unit**: `Cmd + U` или
  ```bash
  xcodebuild test -scheme MobileMessenger -destination 'platform=iOS Simulator,name=iPhone 15'
  ```
- **UI / Snapshot**: запускайте из Xcode или через `xcodebuild test` с нужной схемой.
- **Static Analysis**: SwiftLint + SwiftFormat (рекомендуется добавить в pre-commit).

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
