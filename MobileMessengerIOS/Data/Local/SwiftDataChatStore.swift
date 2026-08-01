import Foundation

public actor SwiftDataChatStore: @preconcurrency ChatLocalStore {
    private var chats: [UUID: ChatRecord] = [:]
    private var messageStreams: [UUID: [UUID: AsyncStream<Message>.Continuation]] = [:]
    private var chatStreams: [UUID: AsyncStream<[Chat]>.Continuation] = [:]
    private let storageURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var persistenceTask: Task<Void, Never>?
    private var persistenceGeneration = 0
    private static let persistenceDelayNanoseconds: UInt64 = 300_000_000

    public init(storageURL: URL? = nil) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        self.encoder = encoder

        self.decoder = .mobileMessengerISO8601()

        let defaultURL = Self.defaultStorageURL()
        self.storageURL = storageURL ?? defaultURL
        self.chats = Self.loadState(from: self.storageURL, using: decoder)
    }

    public func ensureChatExists(id: UUID, title: String) async throws {
        if chats[id] == nil {
            chats[id] = ChatRecord(
                id: id,
                title: title,
                lastMessagePreview: nil,
                lastActivity: Date(),
                unreadCount: 0,
                typingParticipants: [],
                participantNames: [],
                participantCount: 1,
                messages: []
            )
            schedulePersistence()
        }
    }

    public func removeChat(id: UUID) async throws {
        let removedRecord = chats.removeValue(forKey: id)
        let messageContinuations = messageStreams.removeValue(forKey: id)

        guard removedRecord != nil || messageContinuations != nil else {
            return
        }

        try persistImmediately()
        broadcastChats()
        messageContinuations?.values.forEach { $0.finish() }
    }

    public func upsert(chats: [Chat]) async throws {
        for chat in chats {
            var record = self.chats[chat.id] ?? ChatRecord(
                id: chat.id,
                title: chat.title,
                lastMessagePreview: chat.lastMessagePreview,
                lastActivity: chat.lastActivity,
                unreadCount: chat.unreadCount,
                typingParticipants: chat.typingParticipants,
                participantNames: chat.participantNames,
                participantCount: chat.participantCount,
                messages: []
            )
            record.merge(chat: chat)
            self.chats[chat.id] = record
        }
        schedulePersistence()
        broadcastChats()
    }

    public func upsert(messages: [Message], for chatID: UUID) async throws {
        guard !messages.isEmpty else { return }

        var record = chats[chatID] ?? Self.makeRecord(
            chatID: chatID,
            title: "Диалог",
            lastActivity: messages[0].createdAt
        )
        let requiresImmediatePersistence = messages.contains { message in
            Self.isPending(message.status) ||
            record.messages.contains(where: {
                ($0.id == message.id || $0.localID == message.localID) &&
                Self.isPending($0.status)
            })
        }
        record.upsert(messages: messages)
        chats[chatID] = record

        if requiresImmediatePersistence {
            try persistImmediately()
        } else {
            schedulePersistence()
        }
        broadcastChats()
        for message in messages {
            messageStreams[chatID]?.values.forEach { $0.yield(message) }
        }
    }

    public func append(message: Message, for chatID: UUID) async throws {
        let matchingMessageWasPending = chats[chatID]?.messages.contains(where: {
            ($0.id == message.id || $0.localID == message.localID) &&
            Self.isPending($0.status)
        }) ?? false
        try merge(message: message, into: chatID)
        if Self.isPending(message.status) || matchingMessageWasPending {
            try persistImmediately()
        } else {
            schedulePersistence()
        }
        broadcastChats()
        messageStreams[chatID]?.values.forEach { $0.yield(message) }
    }

    public func replaceMessage(localID: UUID, in chatID: UUID, with message: Message) async throws {
        var record = chats[chatID] ?? ChatRecord(
            id: chatID,
            title: "Диалог",
            lastMessagePreview: nil,
            lastActivity: message.createdAt,
            unreadCount: 0,
            typingParticipants: [],
            participantNames: [],
            participantCount: 1,
            messages: []
        )
        record.replace(localID: localID, with: message)
        chats[chatID] = record
        try persistImmediately()
        broadcastChats()
        messageStreams[chatID]?.values.forEach { $0.yield(message) }
    }

    public func loadMessages(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        guard let record = chats[chatID] else { return [] }
        if let messageID {
            guard let index = record.messages.firstIndex(where: {
                $0.id.messageID == messageID || $0.localID == messageID
            }) else { return [] }
            let start = max(0, index - limit)
            return Array(record.messages[start..<index])
        } else {
            return Array(record.messages.suffix(limit))
        }
    }

    public func observeChats() -> AsyncStream<[Chat]> {
        AsyncStream { continuation in
            let id = UUID()
            chatStreams[id] = continuation
            continuation.yield(currentChats())
            continuation.onTermination = { _ in
                Task { await self.removeChatContinuation(id: id) }
            }
        }
    }

    public func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        AsyncStream { continuation in
            let token = UUID()
            messageStreams[chatID, default: [:]][token] = continuation
            continuation.onTermination = { _ in
                Task { await self.removeContinuation(for: chatID, token: token) }
            }
        }
    }

    public func fetchChats(searchQuery: String?) async throws -> [Chat] {
        currentChats(searchQuery: searchQuery)
    }

    public func updateTypingParticipants(_ participants: [String], in chatID: UUID) async throws {
        guard var record = chats[chatID] else { return }
        record.typingParticipants = participants
        chats[chatID] = record
        schedulePersistence()
        broadcastChats()
    }

    public func updateStatus(for messageID: UUID, in chatID: UUID, status: MessageStatus) async throws {
        guard var record = chats[chatID] else { return }
        guard let index = record.messages.firstIndex(where: { $0.id.messageID == messageID }) else { return }
        let wasPending = Self.isPending(record.messages[index].status)
        let updated = record.messages[index].updatingStatus(status)
        record.messages[index] = updated
        record.refreshDerivedFields(messagesAreSorted: true)
        chats[chatID] = record
        if wasPending || Self.isPending(status) {
            try persistImmediately()
        } else {
            schedulePersistence()
        }
        broadcastChats()
        messageStreams[chatID]?.values.forEach { $0.yield(updated) }
    }

    public func updateStatus(forLocalID localID: UUID, in chatID: UUID, status: MessageStatus) async throws {
        guard var record = chats[chatID] else { return }
        guard let index = record.messages.firstIndex(where: { $0.localID == localID }) else { return }
        let wasPending = Self.isPending(record.messages[index].status)
        let updated = record.messages[index].updatingStatus(status)
        record.messages[index] = updated
        record.refreshDerivedFields(messagesAreSorted: true)
        chats[chatID] = record
        if wasPending || Self.isPending(status) {
            try persistImmediately()
        } else {
            schedulePersistence()
        }
        broadcastChats()
        messageStreams[chatID]?.values.forEach { $0.yield(updated) }
    }

    public func pendingMessages(in chatID: UUID) async throws -> [Message] {
        guard let record = chats[chatID] else { return [] }
        return record.messages.filter { message in
            message.isOutgoing && Self.isPending(message.status)
        }
    }

    public func allPendingMessages() async throws -> [Message] {
        chats.values
            .flatMap(\.messages)
            .filter { $0.isOutgoing && Self.isPending($0.status) }
            .sorted(by: Self.sortMessages)
    }

    public func purgeMessages(olderThan date: Date) async throws {
        for (chatID, var record) in chats {
            record.messages.removeAll { $0.createdAt < date }
            record.refreshDerivedFields(messagesAreSorted: true)
            chats[chatID] = record
        }
        try persistImmediately()
        broadcastChats()
    }

    public func reset() async throws {
        chats = [:]
        try persistImmediately()
        broadcastChats()
    }

    private func removeContinuation(for chatID: UUID, token: UUID) {
        messageStreams[chatID]?[token] = nil
        if messageStreams[chatID]?.isEmpty == true {
            messageStreams[chatID] = nil
        }
    }

    private func removeChatContinuation(id: UUID) {
        chatStreams[id] = nil
    }

    private func merge(message: Message, into chatID: UUID) throws {
        var record = chats[chatID] ?? Self.makeRecord(
            chatID: chatID,
            title: "Диалог",
            lastActivity: message.createdAt
        )
        record.upsert(message: message)
        chats[chatID] = record
    }

    private static func makeRecord(
        chatID: UUID,
        title: String,
        lastActivity: Date
    ) -> ChatRecord {
        ChatRecord(
            id: chatID,
            title: title,
            lastMessagePreview: nil,
            lastActivity: lastActivity,
            unreadCount: 0,
            typingParticipants: [],
            participantNames: [],
            participantCount: 1,
            messages: []
        )
    }

    private static func sortMessages(lhs: Message, rhs: Message) -> Bool {
        if lhs.createdAt == rhs.createdAt {
            return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
        }
        return lhs.createdAt < rhs.createdAt
    }

    private func persistState() throws {
        let directory = storageURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: nil
        )
        let payload = PersistedState(chats: Array(chats.values))
        let data = try encoder.encode(payload)
        try data.write(to: storageURL, options: .atomic)
    }

    private func persistImmediately() throws {
        persistenceGeneration += 1
        persistenceTask?.cancel()
        persistenceTask = nil
        try persistState()
    }

    private func schedulePersistence() {
        persistenceGeneration += 1
        let generation = persistenceGeneration
        persistenceTask?.cancel()
        persistenceTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: Self.persistenceDelayNanoseconds)
            } catch {
                return
            }
            await self?.persistScheduledState(generation: generation)
        }
    }

    private func persistScheduledState(generation: Int) {
        guard generation == persistenceGeneration else { return }
        persistenceTask = nil
        try? persistState()
    }

    private func broadcastChats() {
        let snapshot = currentChats()
        chatStreams.values.forEach { continuation in
            continuation.yield(snapshot)
        }
    }

    private func currentChats(searchQuery: String? = nil) -> [Chat] {
        let normalizedQuery = searchQuery?.lowercased()
        return chats.values
            .map { $0.toChat() }
            .filter { chat in
                guard let normalizedQuery, !normalizedQuery.isEmpty else { return true }
                return chat.title.lowercased().contains(normalizedQuery) ||
                (chat.lastMessagePreview?.lowercased().contains(normalizedQuery) ?? false) ||
                chat.participantNames.contains(where: { $0.lowercased().contains(normalizedQuery) })
            }
            .sorted { lhs, rhs in
                if lhs.lastActivity == rhs.lastActivity {
                    return lhs.id.uuidString < rhs.id.uuidString
                }
                return lhs.lastActivity > rhs.lastActivity
            }
    }

    private static func defaultStorageURL() -> URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ??
        URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        return appSupport
            .appendingPathComponent("MobileMessengerIOS", isDirectory: true)
            .appendingPathComponent("chat-store.json", isDirectory: false)
    }

    private static func loadState(from url: URL, using decoder: JSONDecoder) -> [UUID: ChatRecord] {
        guard let data = try? Data(contentsOf: url),
              let payload = try? decoder.decode(PersistedState.self, from: data) else {
            return [:]
        }
        return payload.chats.reduce(into: [:]) { partialResult, record in
            var normalizedRecord = record
            normalizedRecord.normalize()
            partialResult[normalizedRecord.id] = normalizedRecord
        }
    }

    private static func isPending(_ status: MessageStatus) -> Bool {
        switch status {
        case .sending, .failed:
            return true
        case .sent, .delivered, .read:
            return false
        }
    }

    private struct PersistedState: Codable {
        var chats: [ChatRecord]
    }

    private struct ChatRecord: Codable {
        var id: UUID
        var title: String
        var lastMessagePreview: String?
        var lastActivity: Date
        var unreadCount: Int
        var typingParticipants: [String]
        var participantNames: [String]
        var participantCount: Int
        var messages: [Message]

        func toChat() -> Chat {
            return Chat(
                id: id,
                title: title,
                lastMessagePreview: lastMessagePreview,
                lastActivity: lastActivity,
                unreadCount: unreadCount,
                typingParticipants: typingParticipants,
                participantNames: participantNames,
                participantCount: participantCount
            )
        }

        mutating func merge(chat: Chat) {
            title = chat.title
            unreadCount = chat.unreadCount
            typingParticipants = chat.typingParticipants
            participantNames = chat.participantNames
            participantCount = max(chat.participantCount, 1)

            let latestLocalMessage = messages.last
            if let latestLocalMessage, latestLocalMessage.createdAt >= chat.lastActivity {
                lastActivity = latestLocalMessage.createdAt
                lastMessagePreview = Self.preview(for: latestLocalMessage)
            } else {
                lastActivity = chat.lastActivity
                lastMessagePreview = chat.lastMessagePreview
            }
        }

        mutating func upsert(message: Message) {
            if let index = messages.firstIndex(where: { $0.id == message.id || $0.localID == message.localID }) {
                messages.remove(at: index)
            }
            messages.insert(message, at: insertionIndex(for: message))
            refreshDerivedFields(messagesAreSorted: true)
        }

        mutating func upsert(messages newMessages: [Message]) {
            var indexByMessageID: [Message.Identifier: Int] = [:]
            var indexByLocalID: [UUID: Int] = [:]
            for (index, message) in messages.enumerated() {
                indexByMessageID[message.id] = index
                indexByLocalID[message.localID] = index
            }

            for message in newMessages {
                let index = indexByMessageID[message.id] ?? indexByLocalID[message.localID]
                if let index {
                    let previous = messages[index]
                    indexByMessageID[previous.id] = nil
                    indexByLocalID[previous.localID] = nil
                    messages[index] = message
                    indexByMessageID[message.id] = index
                    indexByLocalID[message.localID] = index
                } else {
                    let newIndex = messages.endIndex
                    messages.append(message)
                    indexByMessageID[message.id] = newIndex
                    indexByLocalID[message.localID] = newIndex
                }
            }

            messages.sort(by: SwiftDataChatStore.sortMessages)
            refreshDerivedFields(messagesAreSorted: true)
        }

        mutating func replace(localID: UUID, with message: Message) {
            if let index = messages.firstIndex(where: { $0.localID == localID || $0.id == message.id }) {
                messages.remove(at: index)
            }
            messages.insert(message, at: insertionIndex(for: message))
            refreshDerivedFields(messagesAreSorted: true)
        }

        mutating func refreshDerivedFields(messagesAreSorted: Bool = false) {
            if !messagesAreSorted {
                messages.sort(by: SwiftDataChatStore.sortMessages)
            }
            if let lastMessage = messages.last {
                lastActivity = lastMessage.createdAt
                lastMessagePreview = Self.preview(for: lastMessage)
            }
            unreadCount = messages.filter { !$0.isOutgoing && $0.status != .read }.count
        }

        mutating func normalize() {
            messages.sort(by: SwiftDataChatStore.sortMessages)
        }

        private func insertionIndex(for message: Message) -> Int {
            var lowerBound = messages.startIndex
            var upperBound = messages.endIndex
            while lowerBound < upperBound {
                let middle = lowerBound + (upperBound - lowerBound) / 2
                if SwiftDataChatStore.sortMessages(lhs: messages[middle], rhs: message) {
                    lowerBound = middle + 1
                } else {
                    upperBound = middle
                }
            }
            return lowerBound
        }

        private static func preview(for message: Message) -> String? {
            if message.deletedAt != nil {
                return "Сообщение удалено"
            }
            if !message.text.isEmpty {
                return message.text
            }
            if message.kind == .image {
                return "Фото"
            }
            return nil
        }
    }
}
