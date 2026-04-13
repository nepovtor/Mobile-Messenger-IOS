import Foundation

public final class DefaultChatRepository: ChatRepository {
    private let store: ChatLocalStore
    private let remote: ChatNetworking
    private let realtime: ChatRealtimeService
    private let analytics: AnalyticsService

    public init(
        store: ChatLocalStore,
        remote: ChatNetworking,
        realtime: ChatRealtimeService,
        analytics: AnalyticsService
    ) {
        self.store = store
        self.remote = remote
        self.realtime = realtime
        self.analytics = analytics
    }

    public func createChat(title: String, participantContacts: [String]) async throws -> Chat {
        try await remote.createChat(title: title, participantContacts: participantContacts).asDomainChat()
    }

    public func listChats(searchQuery: String?) async throws -> [Chat] {
        try await remote.listChats(searchQuery: searchQuery).map { try $0.asDomainChat() }
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
                        try? await store.ensureChatExists(id: chatID, title: "Диалог")
                        try? await store.append(message: message, for: chatID)
                    case .messageRead(let messageID):
                        try? await store.updateStatus(for: messageID, in: chatID, status: .read)
                    case .connected, .disconnected, .typing:
                        break
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
        let messages = try await remote.loadMessages(chatID: chatID, limit: limit, before: messageID).map { $0.asDomainMessage() }
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.upsert(messages: messages, for: chatID)
        return messages
    }

    public func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message {
        let local = localID ?? UUID()
        let response = try await remote.sendMessage(
            chatID: chatID,
            kind: .text,
            text: text,
            mediaID: nil,
            localID: local
        )
        let message = response.asDomainMessage(localID: local)
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: message, for: chatID)
        analytics.track(event: AppAnalyticsEvent(kind: .messageSent, metadata: ["chatID": chatID.uuidString]))
        return message
    }

    public func sendImageMessage(chatID: UUID, imageData: Data, caption: String?, localID: UUID?) async throws -> Message {
        let local = localID ?? UUID()
        let upload = try await remote.requestUploadURL(
            mimeType: "image/jpeg",
            sizeBytes: imageData.count,
            width: nil,
            height: nil
        )
        let etag = try await remote.uploadImage(to: upload.uploadURL, data: imageData, mimeType: "image/jpeg")
        try await remote.confirmUpload(mediaID: upload.mediaID, etag: etag)

        let response = try await remote.sendMessage(
            chatID: chatID,
            kind: .image,
            text: caption,
            mediaID: upload.mediaID,
            localID: local
        )
        let message = response.asDomainMessage(localID: local)
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: message, for: chatID)
        analytics.track(event: AppAnalyticsEvent(kind: .messageSent, metadata: ["chatID": chatID.uuidString, "kind": "image"]))
        return message
    }

    public func setTyping(chatID: UUID, isTyping: Bool) async {
        do {
            try await remote.setTyping(chatID: chatID, isTyping: isTyping)
        } catch {
            analytics.track(error: error, context: "setTyping")
        }
    }

    public func retryPendingMessages(for chatID: UUID) async {
        do {
            let refreshed = try await remote.loadMessages(chatID: chatID, limit: 100, before: nil).map { $0.asDomainMessage() }
            try await store.upsert(messages: refreshed, for: chatID)
        } catch {
            analytics.track(error: error, context: "retryPendingMessages")
        }
    }

    public func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {
        if status == .read {
            try await remote.markRead(chatID: chatID, messageID: messageID)
        }
        try await store.updateStatus(for: messageID, in: chatID, status: status)
    }
}

private extension ServerChat {
    func asDomainChat() throws -> Chat {
        Chat(
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
}
