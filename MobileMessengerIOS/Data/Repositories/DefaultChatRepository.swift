import Foundation

public final class DefaultChatRepository: ChatRepository {
    private let store: ChatLocalStore
    private let remote: ChatNetworking
    private let realtime: ChatRealtimeService
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let fileManager: FileManager
    private let pendingSendCoordinator = PendingSendCoordinator()
    private var reachabilityTask: Task<Void, Never>?
    private var realtimeTask: Task<Void, Never>?

    public init(
        store: ChatLocalStore,
        remote: ChatNetworking,
        realtime: ChatRealtimeService,
        analytics: AnalyticsService,
        reachability: ReachabilityService,
        fileManager: FileManager = .default
    ) {
        self.store = store
        self.remote = remote
        self.realtime = realtime
        self.analytics = analytics
        self.reachability = reachability
        self.fileManager = fileManager

        reachabilityTask = Task { [weak self] in
            await self?.observeReachability()
        }
        realtimeTask = Task { [weak self] in
            await self?.observeRealtime()
        }
        Task { [weak self] in
            await self?.retryAllPendingMessages()
        }
    }

    deinit {
        reachabilityTask?.cancel()
        realtimeTask?.cancel()
    }

    public func createChat(title: String, participantContacts: [String]) async throws -> Chat {
        let chat = try await remote.createChat(title: title, participantContacts: participantContacts).asDomainChat()
        try await store.upsert(chats: [chat])
        return chat
    }

    public func cachedChats(searchQuery: String?) async -> [Chat] {
        (try? await store.fetchChats(searchQuery: searchQuery)) ?? []
    }

    public func listChats(searchQuery: String?) async throws -> [Chat] {
        do {
            let chats = try await remote.listChats(searchQuery: searchQuery).map { try $0.asDomainChat() }
            try await store.upsert(chats: chats)
            return try await store.fetchChats(searchQuery: searchQuery)
        } catch {
            let cached = try await store.fetchChats(searchQuery: searchQuery)
            guard !cached.isEmpty else { throw error }
            analytics.track(error: error, context: "chat_list_remote_fallback")
            return cached
        }
    }

    public func observeChats() -> AsyncStream<[Chat]> {
        store.observeChats()
    }

    public func cachedHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async -> [Message] {
        (try? await store.loadMessages(for: chatID, limit: limit, before: messageID)) ?? []
    }

    public func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        store.observeMessages(for: chatID)
    }

    public func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        do {
            let messages = try await remote.loadMessages(chatID: chatID, limit: limit, before: messageID).map { $0.asDomainMessage() }
            try await store.ensureChatExists(id: chatID, title: "Диалог")
            try await store.upsert(messages: messages, for: chatID)
            return try await store.loadMessages(for: chatID, limit: limit, before: messageID)
        } catch {
            let cached = try await store.loadMessages(for: chatID, limit: limit, before: messageID)
            guard !cached.isEmpty else { throw error }
            analytics.track(error: error, context: "chat_history_remote_fallback")
            return cached
        }
    }

    public func sendMessage(chatID: UUID, text: String, localID: UUID?, repliedTo: Message.Identifier?) async throws -> Message {
        let local = localID ?? UUID()
        let optimistic = Message(
            id: Message.Identifier(chatID: chatID, messageID: local),
            localID: local,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .text,
            text: text,
            createdAt: Date(),
            status: .sending,
            repliedTo: repliedTo
        )
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: optimistic, for: chatID)
        Task { [weak self] in
            await self?.attemptDelivery(of: optimistic)
        }
        return optimistic
    }

    public func sendImageMessage(chatID: UUID, imageData: Data, caption: String?, localID: UUID?, repliedTo: Message.Identifier?) async throws -> Message {
        let local = localID ?? UUID()
        let localFileURL = try savePendingImage(data: imageData, localID: local)
        let optimistic = Message(
            id: Message.Identifier(chatID: chatID, messageID: local),
            localID: local,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .image,
            text: caption ?? "",
            createdAt: Date(),
            status: .sending,
            attachments: [
                MessageAttachment(
                    id: local,
                    kind: .image,
                    url: nil,
                    localPath: localFileURL,
                    thumbnailURL: nil,
                    fileSize: Int64(imageData.count)
                )
            ],
            repliedTo: repliedTo
        )
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: optimistic, for: chatID)
        Task { [weak self] in
            await self?.attemptDelivery(of: optimistic)
        }
        return optimistic
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
            let pending = try await store.pendingMessages(in: chatID)
            for message in pending.sorted(by: { $0.createdAt < $1.createdAt }) {
                try? await store.updateStatus(forLocalID: message.localID, in: chatID, status: .sending)
                await attemptDelivery(of: message)
            }
            let refreshed = try await remote.loadMessages(chatID: chatID, limit: 100, before: nil).map { $0.asDomainMessage() }
            try await store.upsert(messages: refreshed, for: chatID)
        } catch {
            analytics.track(error: error, context: "retryPendingMessages")
        }
    }

    public func refreshForForeground() async {
        await retryAllPendingMessages()
        do {
            let chats = try await remote.listChats(searchQuery: nil).map { try $0.asDomainChat() }
            try await store.upsert(chats: chats)
        } catch {
            analytics.track(error: error, context: "foreground_refresh_chats")
        }
    }

    public func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {
        if status == .read {
            try await remote.markRead(chatID: chatID, messageID: messageID)
        }
        try await store.updateStatus(for: messageID, in: chatID, status: status)
    }

    private func attemptDelivery(of message: Message) async {
        guard await pendingSendCoordinator.begin(localID: message.localID) else { return }

        guard reachability.isReachable else {
            await pendingSendCoordinator.finish(localID: message.localID)
            return
        }

        do {
            let deliveredMessage: Message
            switch message.kind {
            case .text:
                let response = try await remote.sendMessage(
                    chatID: message.id.chatID,
                    kind: .text,
                    text: message.text,
                    mediaID: nil,
                    localID: message.localID
                )
                deliveredMessage = response.asDomainMessage(localID: message.localID).copying(repliedTo: message.repliedTo)
            case .image:
                let localFileURL = message.attachments.first(where: { $0.kind == .image })?.localPath
                guard let localFileURL else {
                    try await store.updateStatus(forLocalID: message.localID, in: message.id.chatID, status: .failed)
                    await pendingSendCoordinator.finish(localID: message.localID)
                    return
                }
                let data = try Data(contentsOf: localFileURL)
                let upload = try await remote.requestUploadURL(
                    mimeType: "image/jpeg",
                    sizeBytes: data.count,
                    width: nil,
                    height: nil
                )
                let etag = try await remote.uploadImage(to: upload.uploadURL, data: data, mimeType: "image/jpeg")
                try await remote.confirmUpload(mediaID: upload.mediaID, etag: etag)
                let response = try await remote.sendMessage(
                    chatID: message.id.chatID,
                    kind: .image,
                    text: message.text.isEmpty ? nil : message.text,
                    mediaID: upload.mediaID,
                    localID: message.localID
                )
                deliveredMessage = response.asDomainMessage(localID: message.localID).copying(repliedTo: message.repliedTo)
                try? fileManager.removeItem(at: localFileURL)
            }

            try await store.replaceMessage(localID: message.localID, in: message.id.chatID, with: deliveredMessage)
            analytics.track(event: AppAnalyticsEvent(kind: .messageSent, metadata: [
                "chatID": message.id.chatID.uuidString,
                "kind": message.kind.rawValue
            ]))
        } catch {
            if reachability.isReachable {
                try? await store.updateStatus(forLocalID: message.localID, in: message.id.chatID, status: .failed)
            }
            analytics.track(error: error, context: "send_message_delivery")
        }

        await pendingSendCoordinator.finish(localID: message.localID)
    }

    private func observeReachability() async {
        for await isReachable in reachability.observe() {
            guard isReachable else { continue }
            await retryAllPendingMessages()
        }
    }

    private func observeRealtime() async {
        for await envelope in realtime.observeAllEvents() {
            switch envelope.event {
            case .message(let message):
                try? await store.ensureChatExists(id: envelope.chatID, title: "Диалог")
                try? await store.append(message: message, for: envelope.chatID)
            case .messageRead(let messageID):
                try? await store.updateStatus(for: messageID, in: envelope.chatID, status: .read)
            case .typing(let participants):
                try? await store.ensureChatExists(id: envelope.chatID, title: "Диалог")
                try? await store.updateTypingParticipants(participants, in: envelope.chatID)
            case .connected, .disconnected:
                break
            }
        }
    }

    private func retryAllPendingMessages() async {
        do {
            let pending = try await store.allPendingMessages()
            let chatIDs = Set(pending.map(\.id.chatID))
            for chatID in chatIDs {
                await retryPendingMessages(for: chatID)
            }
        } catch {
            analytics.track(error: error, context: "retry_all_pending_messages")
        }
    }

    private func savePendingImage(data: Data, localID: UUID) throws -> URL {
        let directory = pendingImagesDirectory()
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: nil
        )
        let url = directory.appendingPathComponent("\(localID.uuidString).jpg")
        try data.write(to: url, options: .atomic)
        return url
    }

    private func pendingImagesDirectory() -> URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ??
        URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        return appSupport.appendingPathComponent("MobileMessengerIOS/pending-images", isDirectory: true)
    }
}

private actor PendingSendCoordinator {
    private var inFlight: Set<UUID> = []

    func begin(localID: UUID) -> Bool {
        inFlight.insert(localID).inserted
    }

    func finish(localID: UUID) {
        inFlight.remove(localID)
    }
}
