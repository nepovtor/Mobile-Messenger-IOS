import Foundation

public final class SwiftDataChatStore: ChatLocalStore, @unchecked Sendable {
    private var chats: [UUID: ChatRecord] = [:]
    private var messageStreams: [UUID: AsyncStream<Message>.Continuation] = [:]
    private let queue = DispatchQueue(label: "SwiftDataChatStore.queue", attributes: .concurrent)

    public init() {}

    public func ensureChatExists(id: UUID, title: String) async throws {
        queue.sync(flags: .barrier) {
            if chats[id] == nil {
                chats[id] = ChatRecord(id: id, title: title, messages: [])
            } else {
                chats[id]?.title = title
            }
        }
    }

    public func upsert(chats newChats: [Chat]) async throws {
        queue.sync(flags: .barrier) {
            for chat in newChats {
                var record = chats[chat.id] ?? ChatRecord(id: chat.id, title: chat.title, messages: [])
                record.title = chat.title
                record.lastUpdated = chat.lastActivity
                record.cachedLastMessagePreview = chat.lastMessagePreview
                record.cachedUnreadCount = chat.unreadCount
                record.cachedTypingParticipants = chat.typingParticipants
                chats[chat.id] = record
            }
        }
    }

    public func upsert(messages: [Message], for chatID: UUID) async throws {
        queue.sync(flags: .barrier) {
            var record = chats[chatID] ?? ChatRecord(id: chatID, title: AppLanguagePreference.localized(ru: "Диалог", en: "Chat"), messages: [])
            var existing: [Message.Identifier: Message] = [:]
            var changedMessages: [Message] = []
            for message in record.messages {
                existing[message.id] = message
            }
            for message in messages {
                if existing[message.id] != message {
                    changedMessages.append(message)
                }
                existing[message.id] = message
            }
            record.messages = existing.values.sorted(by: Self.sortMessages)
            record.lastUpdated = record.messages.last?.createdAt ?? Date()
            record.cachedLastMessagePreview = record.messages.last?.text ?? record.cachedLastMessagePreview
            record.cachedUnreadCount = record.messages.filter { !$0.isOutgoing && $0.status != .read }.count
            chats[chatID] = record
            for message in changedMessages {
                messageStreams[chatID]?.yield(message)
            }
        }
    }

    public func append(message: Message, for chatID: UUID) async throws {
        queue.sync(flags: .barrier) {
            var record = chats[chatID] ?? ChatRecord(id: chatID, title: AppLanguagePreference.localized(ru: "Диалог", en: "Chat"), messages: [])
            if let existingIndex = record.messages.firstIndex(where: { $0.id == message.id }) {
                if record.messages[existingIndex] == message {
                    return
                }
                record.messages[existingIndex] = message
            } else {
                record.messages.append(message)
            }
            record.messages.sort(by: Self.sortMessages)
            record.lastUpdated = max(record.lastUpdated, message.createdAt)
            record.cachedLastMessagePreview = record.messages.last?.text ?? record.cachedLastMessagePreview
            record.cachedUnreadCount = record.messages.filter { !$0.isOutgoing && $0.status != .read }.count
            chats[chatID] = record
            messageStreams[chatID]?.yield(message)
        }
    }

    public func fetchChat(id: UUID) async throws -> Chat? {
        queue.sync {
            chats[id]?.toChat()
        }
    }

    public func loadMessages(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        return queue.sync {
            guard var record = chats[chatID] else { return [] }
            record.messages.sort(by: Self.sortMessages)
            if let messageID {
                guard let index = record.messages.firstIndex(where: { $0.id.messageID == messageID }) else { return [] }
                let start = max(0, index - limit)
                return Array(record.messages[start..<index])
            } else {
                return Array(record.messages.suffix(limit))
            }
        }
    }

    public func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        AsyncStream { continuation in
            queue.sync(flags: .barrier) {
                messageStreams[chatID] = continuation
            }
            continuation.onTermination = { _ in
                self.removeContinuation(for: chatID)
            }
        }
    }

    public func fetchChats(searchQuery: String?) async throws -> [Chat] {
        return queue.sync {
            chats.values
                .map { $0.toChat() }
                .filter { chat in
                    guard let query = searchQuery, !query.isEmpty else { return true }
                    return chat.title.lowercased().contains(query.lowercased()) ||
                    (chat.lastMessagePreview?.lowercased().contains(query.lowercased()) ?? false)
                }
                .sorted { lhs, rhs in
                    if lhs.lastActivity == rhs.lastActivity {
                        return lhs.id.uuidString < rhs.id.uuidString
                    }
                    return lhs.lastActivity > rhs.lastActivity
                }
        }
    }

    public func updateStatus(for messageID: UUID, in chatID: UUID, status: MessageStatus) async throws {
        queue.sync(flags: .barrier) {
            guard var record = chats[chatID] else { return }
            guard let index = record.messages.firstIndex(where: { $0.id.messageID == messageID }) else { return }
            let updated = record.messages[index].updatingStatus(status)
            record.messages[index] = updated
            record.lastUpdated = record.messages.last?.createdAt ?? record.lastUpdated
            record.cachedLastMessagePreview = record.messages.last?.text ?? record.cachedLastMessagePreview
            record.cachedUnreadCount = record.messages.filter { !$0.isOutgoing && $0.status != .read }.count
            chats[chatID] = record
            messageStreams[chatID]?.yield(updated)
        }
    }

    public func pendingMessages(in chatID: UUID) async throws -> [Message] {
        return queue.sync {
            guard let record = chats[chatID] else { return [] }
            return record.messages.filter { message in
                message.isOutgoing && (message.status == .sending || message.status == .failed)
            }
        }
    }

    public func purgeMessages(olderThan date: Date) async throws {
        queue.sync(flags: .barrier) {
            for (chatID, var record) in chats {
                record.messages.removeAll { $0.createdAt < date }
                chats[chatID] = record
            }
        }
    }

    private func removeContinuation(for chatID: UUID) {
        queue.sync(flags: .barrier) {
            messageStreams[chatID] = nil
        }
    }

    private static func sortMessages(lhs: Message, rhs: Message) -> Bool {
        if lhs.createdAt == rhs.createdAt {
            return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
        }
        return lhs.createdAt < rhs.createdAt
    }

    private struct ChatRecord {
        var id: UUID
        var title: String
        var messages: [Message]
        var lastUpdated: Date = Date()
        var cachedLastMessagePreview: String?
        var cachedUnreadCount = 0
        var cachedTypingParticipants: [String] = []

        func toChat() -> Chat {
            let lastMessage = messages.last
            let unreadCount = messages.isEmpty
                ? cachedUnreadCount
                : messages.filter { !$0.isOutgoing && $0.status != .read }.count
            return Chat(
                id: id,
                title: title,
                lastMessagePreview: lastMessage?.text ?? cachedLastMessagePreview,
                lastActivity: lastMessage?.createdAt ?? lastUpdated,
                unreadCount: unreadCount,
                typingParticipants: cachedTypingParticipants
            )
        }
    }
}
