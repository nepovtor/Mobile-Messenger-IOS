import Foundation
import SwiftData

@Model
final class CachedChat {
    @Attribute(.unique) var id: UUID
    var title: String
    var lastMessagePreview: String?
    var updatedAt: Date
    @Relationship(deleteRule: .cascade, inverse: \CachedMessage.chat) var messages: [CachedMessage]

    init(id: UUID, title: String, lastMessagePreview: String? = nil, updatedAt: Date = .now, messages: [CachedMessage] = []) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.updatedAt = updatedAt
        self.messages = messages
    }
}

@Model
final class CachedMessage {
    @Attribute(.unique) var id: UUID
    var text: String
    var isOutgoing: Bool
    var statusRaw: String
    var timestamp: Date
    var chat: CachedChat?

    init(id: UUID, text: String, isOutgoing: Bool, statusRaw: String, timestamp: Date, chat: CachedChat?) {
        self.id = id
        self.text = text
        self.isOutgoing = isOutgoing
        self.statusRaw = statusRaw
        self.timestamp = timestamp
        self.chat = chat
    }
}

@MainActor
protocol ChatCache {
    func ensureChatExists(id: UUID, title: String)
    func loadChats() throws -> [CachedChat]
    func loadMessages(for chatID: UUID) throws -> [ChatMessage]
    func saveMessage(_ message: ChatMessage, in chatID: UUID) throws
    func updateStatus(for messageID: UUID, to status: ChatMessage.DeliveryStatus) throws
}

@MainActor
final class SwiftDataChatCache: ChatCache {
    static let shared = SwiftDataChatCache()

    private let container: ModelContainer
    private var context: ModelContext { container.mainContext }

    private init() {
        do {
            let configuration = ModelConfiguration()
            container = try ModelContainer(for: CachedChat.self, CachedMessage.self, configurations: configuration)
        } catch {
            fatalError("Unable to create SwiftData container: \(error)")
        }
    }

    func ensureChatExists(id: UUID, title: String) {
        if let chat = try? fetchChat(id: id), let chat {
            if chat.title != title {
                chat.title = title
                do {
                    try context.save()
                } catch {
                    DefaultAnalyticsService.shared.trackStorageError(error)
                }
            }
            return
        }

        let chat = CachedChat(id: id, title: title)
        context.insert(chat)
        do {
            try context.save()
        } catch {
            DefaultAnalyticsService.shared.trackStorageError(error)
        }
    }

    func loadChats() throws -> [CachedChat] {
        let descriptor = FetchDescriptor<CachedChat>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        return try context.fetch(descriptor)
    }

    func loadMessages(for chatID: UUID) throws -> [ChatMessage] {
        guard try fetchChat(id: chatID) != nil else { return [] }
        let descriptor = FetchDescriptor<CachedMessage>(
            predicate: #Predicate { message in
                message.chat?.id == chatID
            },
            sortBy: [SortDescriptor(\.timestamp)]
        )
        let cached = try context.fetch(descriptor)
        return cached.map { $0.toChatMessage() }
    }

    func saveMessage(_ message: ChatMessage, in chatID: UUID) throws {
        let chat = try fetchOrCreateChat(id: chatID)

        if let existing = try fetchMessage(id: message.id) {
            existing.text = message.text
            existing.isOutgoing = message.isOutgoing
            existing.statusRaw = message.status.rawValue
            existing.timestamp = message.timestamp
            existing.chat = chat
        } else {
            let cached = CachedMessage(
                id: message.id,
                text: message.text,
                isOutgoing: message.isOutgoing,
                statusRaw: message.status.rawValue,
                timestamp: message.timestamp,
                chat: chat
            )
            context.insert(cached)
            chat.messages.append(cached)
        }

        chat.lastMessagePreview = message.text
        chat.updatedAt = .now

        try context.save()
    }

    func updateStatus(for messageID: UUID, to status: ChatMessage.DeliveryStatus) throws {
        guard let message = try fetchMessage(id: messageID) else { return }
        message.statusRaw = status.rawValue
        message.chat?.updatedAt = .now
        try context.save()
    }

    // MARK: - Helpers

    private func fetchChat(id: UUID) throws -> CachedChat? {
        let descriptor = FetchDescriptor<CachedChat>(
            predicate: #Predicate { chat in
                chat.id == id
            }
        )
        return try context.fetch(descriptor).first
    }

    private func fetchOrCreateChat(id: UUID) throws -> CachedChat {
        if let chat = try fetchChat(id: id) {
            return chat
        }

        let chat = CachedChat(id: id, title: "Диалог")
        context.insert(chat)
        try context.save()
        return chat
    }

    private func fetchMessage(id: UUID) throws -> CachedMessage? {
        let descriptor = FetchDescriptor<CachedMessage>(
            predicate: #Predicate { $0.id == id }
        )
        return try context.fetch(descriptor).first
    }
}

private extension CachedMessage {
    func toChatMessage() -> ChatMessage {
        ChatMessage(
            id: id,
            text: text,
            isOutgoing: isOutgoing,
            status: ChatMessage.DeliveryStatus(rawValue: statusRaw) ?? .sent,
            timestamp: timestamp
        )
    }
}
