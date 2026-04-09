import Foundation

public final class SwiftDataChatStore: ChatLocalStore, @unchecked Sendable {
    private var chats: [UUID: ChatRecord] = [:]
    private var messageStreams: [UUID: [UUID: AsyncStream<Message>.Continuation]] = [:]
    private var chatStreams: [UUID: [UUID: AsyncStream<Chat>.Continuation]] = [:]
    private let queue = DispatchQueue(label: "SwiftDataChatStore.queue", attributes: .concurrent)

    public init() {}

    public func ensureChatExists(id: UUID, title: String) async throws {
        queue.sync(flags: .barrier) {
            let previousChat = chats[id]?.toChat()
            var record = chats[id] ?? Self.makeDefaultRecord(id: id, title: title)
            record.title = title
            chats[id] = record
            broadcastChatIfNeeded(for: id, previousChat: previousChat, updatedRecord: record)
        }
    }

    public func upsert(chats newChats: [Chat]) async throws {
        queue.sync(flags: .barrier) {
            for chat in newChats {
                let previousChat = chats[chat.id]?.toChat()
                var record = chats[chat.id] ?? Self.makeDefaultRecord(id: chat.id, title: chat.title)
                record.title = chat.title
                record.lastUpdated = chat.lastActivity
                record.cachedLastMessagePreview = chat.lastMessagePreview
                record.cachedUnreadCount = chat.unreadCount
                record.cachedTypingParticipants = chat.typingParticipants
                chats[chat.id] = record
                broadcastChatIfNeeded(for: chat.id, previousChat: previousChat, updatedRecord: record)
            }
        }
    }

    public func upsert(messages: [Message], for chatID: UUID) async throws {
        queue.sync(flags: .barrier) {
            let previousChat = chats[chatID]?.toChat()
            var record = chats[chatID] ?? Self.makeDefaultRecord(id: chatID)
            var changedMessages: [Message] = []
            var existingIndexes: [Message.Identifier: Int] = [:]
            existingIndexes.reserveCapacity(record.messages.count)

            for (index, message) in record.messages.enumerated() {
                existingIndexes[message.id] = index
            }

            var requiresSort = false
            for message in messages {
                if let index = existingIndexes[message.id] {
                    if record.messages[index] != message {
                        requiresSort = requiresSort || record.messages[index].createdAt != message.createdAt
                        record.messages[index] = message
                        changedMessages.append(message)
                    }
                } else {
                    record.messages.append(message)
                    changedMessages.append(message)
                    requiresSort = true
                }
            }

            if requiresSort {
                record.messages.sort(by: Self.sortMessages)
            }

            Self.refreshDerivedState(for: &record)
            chats[chatID] = record
            broadcast(messages: changedMessages, for: chatID)
            broadcastChatIfNeeded(for: chatID, previousChat: previousChat, updatedRecord: record)
        }
    }

    public func append(message: Message, for chatID: UUID) async throws {
        queue.sync(flags: .barrier) {
            let previousChat = chats[chatID]?.toChat()
            var record = chats[chatID] ?? Self.makeDefaultRecord(id: chatID)
            var requiresSort = false

            if let existingIndex = record.messages.firstIndex(where: { $0.id == message.id }) {
                if record.messages[existingIndex] == message {
                    return
                }
                requiresSort = record.messages[existingIndex].createdAt != message.createdAt
                record.messages[existingIndex] = message
            } else {
                let insertionIndex = Self.insertionIndex(for: message, in: record.messages)
                record.messages.insert(message, at: insertionIndex)
            }

            if requiresSort {
                record.messages.sort(by: Self.sortMessages)
            }

            Self.refreshDerivedState(for: &record)
            chats[chatID] = record
            broadcast(messages: [message], for: chatID)
            broadcastChatIfNeeded(for: chatID, previousChat: previousChat, updatedRecord: record)
        }
    }

    public func fetchChat(id: UUID) async throws -> Chat? {
        queue.sync {
            chats[id]?.toChat()
        }
    }

    public func observeChat(id: UUID) -> AsyncStream<Chat> {
        AsyncStream { continuation in
            let observerID = UUID()
            queue.sync(flags: .barrier) {
                chatStreams[id, default: [:]][observerID] = continuation
                if let chat = chats[id]?.toChat() {
                    continuation.yield(chat)
                }
            }
            continuation.onTermination = { _ in
                self.removeChatContinuation(for: id, observerID: observerID)
            }
        }
    }

    public func loadMessages(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        return queue.sync {
            guard let record = chats[chatID] else { return [] }
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
            let observerID = UUID()
            queue.sync(flags: .barrier) {
                messageStreams[chatID, default: [:]][observerID] = continuation
            }
            continuation.onTermination = { _ in
                self.removeMessageContinuation(for: chatID, observerID: observerID)
            }
        }
    }

    public func fetchChats(searchQuery: String?) async throws -> [Chat] {
        return queue.sync {
            let normalizedQuery = searchQuery?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()

            return chats.values
                .map { $0.toChat() }
                .filter { chat in
                    guard let normalizedQuery, !normalizedQuery.isEmpty else { return true }
                    return chat.title.lowercased().contains(normalizedQuery) ||
                    (chat.lastMessagePreview?.lowercased().contains(normalizedQuery) ?? false)
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
            let previousChat = chats[chatID]?.toChat()
            guard var record = chats[chatID] else { return }
            guard let index = record.messages.firstIndex(where: { $0.id.messageID == messageID }) else { return }
            let updated = record.messages[index].updatingStatus(status)
            guard record.messages[index] != updated else { return }
            record.messages[index] = updated
            Self.refreshDerivedState(for: &record)
            chats[chatID] = record
            broadcast(messages: [updated], for: chatID)
            broadcastChatIfNeeded(for: chatID, previousChat: previousChat, updatedRecord: record)
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
                let previousChat = record.toChat()
                record.messages.removeAll { $0.createdAt < date }
                Self.refreshDerivedState(for: &record)
                chats[chatID] = record
                broadcastChatIfNeeded(for: chatID, previousChat: previousChat, updatedRecord: record)
            }
        }
    }

    private func removeMessageContinuation(for chatID: UUID, observerID: UUID) {
        queue.sync(flags: .barrier) {
            messageStreams[chatID]?[observerID] = nil
            if messageStreams[chatID]?.isEmpty == true {
                messageStreams[chatID] = nil
            }
        }
    }

    private func removeChatContinuation(for chatID: UUID, observerID: UUID) {
        queue.sync(flags: .barrier) {
            chatStreams[chatID]?[observerID] = nil
            if chatStreams[chatID]?.isEmpty == true {
                chatStreams[chatID] = nil
            }
        }
    }

    private static func sortMessages(lhs: Message, rhs: Message) -> Bool {
        if lhs.createdAt == rhs.createdAt {
            return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
        }
        return lhs.createdAt < rhs.createdAt
    }

    private static func insertionIndex(for message: Message, in messages: [Message]) -> Int {
        var low = 0
        var high = messages.count

        while low < high {
            let mid = (low + high) / 2
            if sortMessages(lhs: messages[mid], rhs: message) {
                low = mid + 1
            } else {
                high = mid
            }
        }

        return low
    }

    private static func refreshDerivedState(for record: inout ChatRecord) {
        if let lastMessage = record.messages.last {
            record.lastUpdated = max(record.lastUpdated, lastMessage.createdAt)
            record.cachedLastMessagePreview = lastMessage.text
        }

        record.cachedUnreadCount = record.messages.reduce(into: 0) { unreadCount, message in
            if !message.isOutgoing && message.status != .read {
                unreadCount += 1
            }
        }
    }

    private static func makeDefaultRecord(id: UUID, title: String = AppLanguagePreference.localized(ru: "Диалог", en: "Chat")) -> ChatRecord {
        ChatRecord(id: id, title: title, messages: [])
    }

    private func broadcast(messages: [Message], for chatID: UUID) {
        guard !messages.isEmpty, let continuations = messageStreams[chatID]?.values else { return }

        for message in messages {
            for continuation in continuations {
                continuation.yield(message)
            }
        }
    }

    private func broadcastChatIfNeeded(for chatID: UUID, previousChat: Chat?, updatedRecord: ChatRecord) {
        let updatedChat = updatedRecord.toChat()
        guard updatedChat != previousChat, let continuations = chatStreams[chatID]?.values else { return }

        for continuation in continuations {
            continuation.yield(updatedChat)
        }
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
