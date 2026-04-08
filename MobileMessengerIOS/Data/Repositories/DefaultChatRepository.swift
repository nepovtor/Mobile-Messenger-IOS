import Foundation

public final class DefaultChatRepository: ChatRepository {
    private let store: ChatLocalStore
    private let realtime: ChatRealtimeService
    private let analytics: AnalyticsService
    private let userSessionProvider: @Sendable () -> SessionStore.AuthenticatedSession?
    private let chatNetworking: ChatNetworking?

    public init(
        store: ChatLocalStore,
        realtime: ChatRealtimeService,
        analytics: AnalyticsService,
        userSessionProvider: @escaping @Sendable () -> SessionStore.AuthenticatedSession?,
        chatNetworking: ChatNetworking? = nil
    ) {
        self.store = store
        self.realtime = realtime
        self.analytics = analytics
        self.userSessionProvider = userSessionProvider
        self.chatNetworking = chatNetworking
    }

    public func listChats(searchQuery: String?) async throws -> [Chat] {
        if let networking = chatNetworking {
            do {
                let dtos = try await networking.listChats()
                let chats = dtos.map { dto in
                    Chat(
                        id: dto.id,
                        title: dto.title,
                        lastMessagePreview: dto.lastMessagePreview,
                        lastActivity: dto.lastActivity,
                        unreadCount: 0
                    )
                }
                try await store.upsert(chats: chats)
                return filterChats(chats, searchQuery: searchQuery)
            } catch {
                analytics.track(error: error, context: "listChats")
                return try await store.fetchChats(searchQuery: searchQuery)
            }
        }

        return try await store.fetchChats(searchQuery: searchQuery)
    }

    public func createChat(title: String, participantIDs: [UUID]) async throws -> Chat {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            throw AppError.network(description: AppLanguagePreference.localized(ru: "Название чата не может быть пустым", en: "Chat title cannot be empty"))
        }

        if let networking = chatNetworking {
            let dto = try await networking.createChat(title: trimmedTitle, participantIDs: participantIDs)
            let chat = Chat(
                id: dto.id,
                title: dto.title,
                lastMessagePreview: dto.lastMessagePreview,
                lastActivity: dto.lastActivity,
                unreadCount: 0
            )
            try await store.upsert(chats: [chat])
            return chat
        }

        let localChat = Chat(
            id: UUID(),
            title: trimmedTitle,
            lastMessagePreview: nil,
            lastActivity: Date(),
            unreadCount: 0
        )
        try await store.upsert(chats: [localChat])
        return localChat
    }

    public func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        let storeStream = store.observeMessages(for: chatID)
        let realtimeStream = realtime.observeEvents(for: chatID)
        realtime.connect(to: chatID)

        return AsyncStream { continuation in
            let realtimeTask = Task {
                for await event in realtimeStream {
                    switch event {
                    case .message(let message):
                        try? await store.append(message: message, for: chatID)
                    case .connected:
                        break
                    case .disconnected:
                        break
                    case .typing(let isTyping):
                        if !isTyping { continue }
                    }
                }
            }

            let storeTask = Task {
                for await message in storeStream {
                    continuation.yield(message)
                }
                continuation.finish()
            }

            continuation.onTermination = { _ in
                realtimeTask.cancel()
                storeTask.cancel()
                self.realtime.disconnect(from: chatID)
            }
        }
    }

    public func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        if let networking = chatNetworking {
            do {
                let currentUserID = userSessionProvider()?.userID
                let dtos = try await networking.getMessages(chatID: chatID)
                let messages = dtos.map { dto in
                    makeMessage(from: dto, chatID: chatID, currentUserID: currentUserID)
                }
                try await store.upsert(messages: messages, for: chatID)
                return messages
            } catch {
                analytics.track(error: error, context: "loadHistory")
                return try await store.loadMessages(for: chatID, limit: limit, before: messageID)
            }
        }

        return try await store.loadMessages(for: chatID, limit: limit, before: messageID)
    }

    public func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message {
        guard let currentSession = userSessionProvider() else {
            throw AppError.unauthorized
        }

        let local = localID ?? UUID()
        try await store.ensureChatExists(id: chatID, title: "Диалог")

        let message = Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: local,
            authorID: currentSession.userID,
            authorName: currentSession.displayName,
            text: text,
            createdAt: Date(),
            isOutgoing: true,
            status: .sending
        )

        try await store.append(message: message, for: chatID)

        if let networking = chatNetworking {
            Task.detached { [weak self, currentSession] in
                guard let self else { return }
                do {
                    let dto = try await networking.sendMessage(
                        chatID: chatID,
                        text: text,
                        messageID: message.id.messageID
                    )
                    let serverMessage = self.makeMessage(
                        from: dto,
                        chatID: chatID,
                        currentUserID: currentSession.userID,
                        fallbackLocalID: local
                    )
                    try await self.store.upsert(messages: [serverMessage], for: chatID)
                } catch {
                    try? await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .failed)
                    self.analytics.track(error: error, context: "sendMessage")
                }
            }
        } else {
            Task.detached { [weak self] in
                guard let self else { return }
                do {
                    try await self.realtime.sendMessage(chatID: chatID, text: text, localID: local)
                    try await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .sent)
                    try await Task.sleep(nanoseconds: 400_000_000)
                    try await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .delivered)
                } catch {
                    try? await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .failed)
                    self.analytics.track(error: error, context: "sendMessageRealtimeFallback")
                }
            }
        }

        analytics.track(event: AnalyticsEvent(kind: .messageSent, metadata: ["chatID": chatID.uuidString]))
        return message
    }

    public func retryPendingMessages(for chatID: UUID) async {
        do {
            let pending = try await store.pendingMessages(in: chatID)
            let currentUserID = userSessionProvider()?.userID

            for message in pending {
                if let networking = chatNetworking {
                    Task.detached { [weak self] in
                        guard let self else { return }
                        do {
                            let dto = try await networking.sendMessage(
                                chatID: chatID,
                                text: message.text,
                                messageID: message.id.messageID
                            )
                            let updatedMessage = self.makeMessage(
                                from: dto,
                                chatID: chatID,
                                currentUserID: currentUserID,
                                fallbackLocalID: message.localID
                            )
                            try await self.store.upsert(messages: [updatedMessage], for: chatID)
                        } catch {
                            self.analytics.track(error: error, context: "retryPendingMessages")
                        }
                    }
                } else {
                    Task.detached { [weak self] in
                        guard let self else { return }
                        do {
                            try await self.realtime.sendMessage(chatID: chatID, text: message.text, localID: message.localID)
                            try await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .sent)
                        } catch {
                            self.analytics.track(error: error, context: "retryPendingMessagesRealtime")
                        }
                    }
                }
            }
        } catch {
            analytics.track(error: error, context: "retryPendingMessages")
        }
    }

    public func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {
        try await store.updateStatus(for: messageID, in: chatID, status: status)
    }

    private func makeMessage(
        from dto: MessageDTO,
        chatID: UUID,
        currentUserID: UUID?,
        fallbackLocalID: UUID = UUID()
    ) -> Message {
        Message(
            id: Message.Identifier(chatID: chatID, messageID: dto.messageID),
            localID: fallbackLocalID,
            authorID: dto.authorID,
            authorName: dto.authorName,
            text: dto.text,
            createdAt: dto.createdAt,
            isOutgoing: dto.authorID == currentUserID,
            status: MessageStatus(rawValue: dto.status) ?? .delivered
        )
    }

    private func filterChats(_ chats: [Chat], searchQuery: String?) -> [Chat] {
        guard let query = searchQuery?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty else {
            return chats
        }

        let normalizedQuery = query.lowercased()
        return chats.filter { chat in
            chat.title.lowercased().contains(normalizedQuery) ||
            (chat.lastMessagePreview?.lowercased().contains(normalizedQuery) ?? false)
        }
    }
}
