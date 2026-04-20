# Миграция на Realm

## Обзор

Текущая реализация использует кастомное JSON-based хранилище (`SwiftDataChatStore`) для локального хранения чатов и сообщений. Для улучшения производительности, надежности и поддержки сложных запросов планируется переход на Realm - мобильную базу данных от MongoDB.

## Преимущества Realm

- Высокая производительность для чтения/записи
- Поддержка сложных запросов и фильтрации
- Автоматическая синхронизация и миграции
- Thread-safe операции
- Поддержка reactive programming

## Шаги миграции

### 1. Добавление Realm в проект

1. Откройте Xcode
2. File → Add Packages...
3. Введите URL: `https://github.com/realm/realm-swift.git`
4. Выберите версию (рекомендуется latest stable)
5. Добавьте пакет в target `MobileMessengerIOS`

### 2. Создание Realm моделей

Создайте новые файлы в `MobileMessengerIOS/Data/Local/Models/`:

#### ChatRealm.swift
```swift
import Foundation
import RealmSwift

class ChatRealm: Object {
    @Persisted(primaryKey: true) var id: UUID
    @Persisted var title: String
    @Persisted var lastMessagePreview: String?
    @Persisted var lastActivity: Date
    @Persisted var unreadCount: Int
    @Persisted var typingParticipants: List<String>
    @Persisted var participantNames: List<String>
    @Persisted var participantCount: Int
    @Persisted var messages: List<MessageRealm>

    convenience init(from chat: Chat) {
        self.init()
        self.id = chat.id
        self.title = chat.title
        self.lastMessagePreview = chat.lastMessagePreview
        self.lastActivity = chat.lastActivity
        self.unreadCount = chat.unreadCount
        self.typingParticipants.append(objectsIn: chat.typingParticipants)
        self.participantNames.append(objectsIn: chat.participantNames)
        self.participantCount = chat.participantCount
        // messages будут добавлены отдельно
    }
}
```

#### MessageRealm.swift
```swift
import Foundation
import RealmSwift

class MessageRealm: Object {
    @Persisted(primaryKey: true) var id: UUID
    @Persisted var localID: UUID?
    @Persisted var chatID: UUID
    @Persisted var senderID: String
    @Persisted var senderName: String
    @Persisted var content: String
    @Persisted var timestamp: Date
    @Persisted var status: String
    @Persisted var type: String
    @Persisted var metadata: Data?

    convenience init(from message: Message) {
        self.init()
        self.id = message.id
        self.localID = message.localID
        self.chatID = message.chatID
        self.senderID = message.senderID
        self.senderName = message.senderName
        self.content = message.content
        self.timestamp = message.timestamp
        self.status = message.status.rawValue
        self.type = message.type.rawValue
        self.metadata = try? JSONEncoder().encode(message.metadata)
    }
}
```

### 3. Реализация RealmChatStore

Создайте `RealmChatStore.swift` в `MobileMessengerIOS/Data/Local/`:

```swift
import Foundation
import RealmSwift
import Combine

public actor RealmChatStore: ChatLocalStore {
    private let realm: Realm

    public init() throws {
        self.realm = try Realm()
    }

    // Реализуйте все методы протокола ChatLocalStore
    // используя Realm для хранения данных

    public func ensureChatExists(id: UUID, title: String) async throws {
        try await realm.write {
            if realm.object(ofType: ChatRealm.self, forPrimaryKey: id) == nil {
                let chat = ChatRealm()
                chat.id = id
                chat.title = title
                chat.lastActivity = Date()
                chat.unreadCount = 0
                chat.participantCount = 1
                realm.add(chat)
            }
        }
    }

    // ... остальные методы
}
```

### 4. Миграция данных

Создайте сервис миграции для переноса данных из JSON в Realm:

```swift
class DataMigrationService {
    static func migrateFromJSONToRealm() async throws {
        // Загрузить данные из SwiftDataChatStore
        // Создать Realm объекты
        // Сохранить в Realm
        // Очистить старые данные
    }
}
```

### 5. Обновление DI-контейнера

В `MobileMessengerIOS/Shared/DI/` обновите регистрацию:

```swift
// Заменить
container.register(ChatLocalStore.self) { _ in
    SwiftDataChatStore()
}

// На
container.register(ChatLocalStore.self) { _ in
    try RealmChatStore()
}
```

### 6. Тестирование

- Создайте unit тесты для RealmChatStore
- Протестируйте миграцию данных
- Проверьте производительность
- Убедитесь в корректности всех операций CRUD

## Риски и соображения

- **Миграция данных**: Убедитесь, что все данные корректно перенесены
- **Производительность**: Realm может быть медленнее для простых операций
- **Размер бинарного файла**: Realm добавляет ~5-10MB к размеру приложения
- **Thread safety**: Все операции с Realm должны быть thread-safe

## Следующие шаги

1. Изучить документацию Realm: https://docs.mongodb.com/realm/sdk/swift/
2. Создать proof-of-concept с базовыми операциями
3. Написать тесты производительности
4. Реализовать полную миграцию</content>
<parameter name="filePath">/Users/nepovtor/Documents/GitHub/Mobile-Messenger-IOS/MIGRATION_TO_REALM.md