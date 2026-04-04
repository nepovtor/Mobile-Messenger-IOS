import Foundation

public final class DefaultChatRepository: ChatRepository {
    private let store: ChatLocalStore
    private let realtime: ChatRealtimeService
    private let analytics: AnalyticsService
    public init(store: ChatLocalStore, realtime: ChatRealtimeService, analytics: AnalyticsService) {
        self.store = store
        self.realtime = realtime
        self.analytics = analytics
        seedChatsIfNeeded()
    }

    public func listChats(searchQuery: String?) async throws -> [Chat] {
        try await store.fetchChats(searchQuery: searchQuery)
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
            }
        }
    }

    public func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        try await store.loadMessages(for: chatID, limit: limit, before: messageID)
    }

    public func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message {
        let local = localID ?? UUID()
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        let message = Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: local,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            text: text,
            createdAt: Date(),
            status: .sending
        )
        try await store.append(message: message, for: chatID)
        realtime.connect(to: chatID)
        Task.detached { [weak self] in
            guard let self else { return }
            do {
                try await self.realtime.sendMessage(chatID: chatID, text: text, localID: local)
                try await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .sent)
                try await Task.sleep(nanoseconds: 400_000_000)
                try await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .delivered)
                try await Task.sleep(nanoseconds: 400_000_000)
                try await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .read)
            } catch {
                try? await self.store.updateStatus(for: message.id.messageID, in: chatID, status: .failed)
                self.analytics.track(error: error, context: "sendMessage")
            }
        }
        analytics.track(event: AppAnalyticsEvent(kind: .messageSent, metadata: ["chatID": chatID.uuidString]))
        return message
    }

    public func retryPendingMessages(for chatID: UUID) async {
        do {
            let pending = try await store.pendingMessages(in: chatID)
            for message in pending {
                Task.detached { [weak self] in
                    try await self?.realtime.sendMessage(chatID: chatID, text: message.text, localID: message.localID)
                }
            }
        } catch {
            analytics.track(error: error, context: "retryPendingMessages")
        }
    }

    public func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {
        try await store.updateStatus(for: messageID, in: chatID, status: status)
    }

    private func seedChatsIfNeeded() {
        Task.detached { [weak self] in
            guard let self else { return }
            do {
                let existing = try await store.fetchChats(searchQuery: nil)
                if existing.isEmpty {
                    let seedChats: [(UUID, String, String)] = [
                        (UUID(), "Команда разработки", "Не забудьте подготовить демо к пятнице."),
                        (UUID(), "Алексей Смирнов", "Спасибо за документы!"),
                        (UUID(), "Семейный чат", "У кого есть идеи для выходных?")
                    ]
                    for (id, title, preview) in seedChats {
                        try await store.ensureChatExists(id: id, title: title)
                        let message = Message(
                            id: Message.Identifier(chatID: id, messageID: UUID()),
                            localID: UUID(),
                            authorID: UUID(),
                            authorName: title,
                            text: preview,
                            createdAt: Date().addingTimeInterval(-Double.random(in: 600...7200)),
                            status: .delivered
                        )
                        try await store.append(message: message, for: id)
                    }
                }
            } catch {
                analytics.track(error: error, context: "seedChats")
            }
        }
    }
}
