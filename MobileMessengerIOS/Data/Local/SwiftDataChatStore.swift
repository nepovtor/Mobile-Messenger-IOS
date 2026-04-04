import Foundation

public actor SwiftDataChatStore: @preconcurrency ChatLocalStore {
    private var chats: [UUID: ChatRecord] = [:]
    private var messageStreams: [UUID: AsyncStream<Message>.Continuation] = [:]

    public init() {}

    public func ensureChatExists(id: UUID, title: String) async throws {
        if chats[id] == nil {
            chats[id] = ChatRecord(id: id, title: title, messages: [])
        }
    }

    public func upsert(messages: [Message], for chatID: UUID) async throws {
        var record = chats[chatID] ?? ChatRecord(id: chatID, title: "Диалог", messages: [])
        var existing: [Message.Identifier: Message] = [:]
        for message in record.messages {
            existing[message.id] = message
        }
        for message in messages {
            existing[message.id] = message
        }
        record.messages = existing.values.sorted(by: Self.sortMessages)
        record.lastUpdated = record.messages.last?.createdAt ?? Date()
        chats[chatID] = record
        for message in messages {
            messageStreams[chatID]?.yield(message)
        }
    }

    public func append(message: Message, for chatID: UUID) async throws {
        var record = chats[chatID] ?? ChatRecord(id: chatID, title: "Диалог", messages: [])
        if !record.messages.contains(where: { $0.id == message.id }) {
            record.messages.append(message)
            record.messages.sort(by: Self.sortMessages)
            record.lastUpdated = max(record.lastUpdated, message.createdAt)
            chats[chatID] = record
            messageStreams[chatID]?.yield(message)
        }
    }

    public func loadMessages(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
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

    public func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        AsyncStream { continuation in
            messageStreams[chatID] = continuation
            continuation.onTermination = { _ in
                Task { await self.removeContinuation(for: chatID) }
            }
        }
    }

    public func fetchChats(searchQuery: String?) async throws -> [Chat] {
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

    public func updateStatus(for messageID: UUID, in chatID: UUID, status: MessageStatus) async throws {
        guard var record = chats[chatID] else { return }
        guard let index = record.messages.firstIndex(where: { $0.id.messageID == messageID }) else { return }
        let updated = record.messages[index].updatingStatus(status)
        record.messages[index] = updated
        chats[chatID] = record
        messageStreams[chatID]?.yield(updated)
    }

    public func pendingMessages(in chatID: UUID) async throws -> [Message] {
        guard let record = chats[chatID] else { return [] }
        return record.messages.filter { message in
            message.isOutgoing && !message.status.isTerminal
        }
    }

    public func purgeMessages(olderThan date: Date) async throws {
        for (chatID, var record) in chats {
            record.messages.removeAll { $0.createdAt < date }
            chats[chatID] = record
        }
    }

    private func removeContinuation(for chatID: UUID) {
        messageStreams[chatID] = nil
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

        func toChat() -> Chat {
            let lastMessage = messages.last
            let unreadCount = messages.filter { !$0.isOutgoing && $0.status != .read }.count
            return Chat(
                id: id,
                title: title,
                lastMessagePreview: lastMessage?.text,
                lastActivity: lastMessage?.createdAt ?? lastUpdated,
                unreadCount: unreadCount
            )
        }
    }
}

