import Foundation

public final class DefaultChatRepository: ChatRepository {
    private let store: ChatLocalStore
    private let remote: ChatNetworking
    private let realtime: ChatRealtimeService
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let fileManager: FileManager
    private let pendingSendCoordinator = PendingSendCoordinator()
    private let activeChatSubscriptions = ActiveChatSubscriptionRegistry()
    private let chatSyncCoordinator = ChatSyncCoordinator()
    private var reachabilityTask: Task<Void, Never>?
    private var realtimeTask: Task<Void, Never>?
    private var connectionStateTask: Task<Void, Never>?

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
        connectionStateTask = Task { [weak self] in
            await self?.observeRealtimeConnectionState()
        }
        Task { [weak self] in
            await self?.retryAllPendingMessages()
        }
    }

    deinit {
        reachabilityTask?.cancel()
        realtimeTask?.cancel()
        connectionStateTask?.cancel()
    }

    public func createChat(title: String, participantContacts: [String]) async throws -> Chat {
        let chat = try await remote.createChat(title: title, participantContacts: participantContacts).asDomainChat()
        try await store.upsert(chats: [chat])
        return chat
    }

    public func deleteChat(chatID: UUID) async throws {
        try await remote.deleteChat(chatID: chatID)
        try await store.removeChat(id: chatID)
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

    public func observeMessages(for chatID: UUID) async -> AsyncStream<Message> {
        let storeEvents = store.observeMessages(for: chatID)
        let registration = await activeChatSubscriptions.add(chatID: chatID)

        if registration.isFirstForChat {
            realtime.connect(to: chatID)
            realtime.activate()
        }

        // The initial history request finishes before ChatViewModel opens this stream.
        // Subscribe first, then reconcile the bounded latest page so an event that lands
        // in that gap is recovered without reloading the full history per event.
        await synchronizeLatestMessages(for: chatID, context: "chat_open_gap_sync")

        return AsyncStream { [weak self] continuation in
            let forwardingTask = Task {
                for await message in storeEvents {
                    guard !Task.isCancelled else { break }
                    guard message.id.chatID == chatID else { continue }
                    continuation.yield(message)
                }
                continuation.finish()
            }

            continuation.onTermination = { [weak self] _ in
                forwardingTask.cancel()
                Task {
                    await self?.finishObservingMessages(
                        chatID: chatID,
                        token: registration.token
                    )
                }
            }
        }
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

    public func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message {
        let local = localID ?? UUID()
        let optimistic = Message(
            id: Message.Identifier(chatID: chatID, messageID: local),
            localID: local,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .text,
            text: text,
            createdAt: Date(),
            status: .sending
        )
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: optimistic, for: chatID)
        Task { [weak self] in
            await self?.attemptDelivery(of: optimistic)
        }
        return optimistic
    }

    public func sendImageMessage(chatID: UUID, imageData: Data, caption: String?, localID: UUID?) async throws -> Message {
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
            ]
        )
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: optimistic, for: chatID)
        Task { [weak self] in
            await self?.attemptDelivery(of: optimistic)
        }
        return optimistic
    }

    public func sendAudioMessage(
        chatID: UUID,
        audioData: Data,
        localID: UUID?
    ) async throws -> Message {
        guard !audioData.isEmpty, audioData.count <= 20_000_000 else {
            throw AppError.network(description: "Некорректный размер голосового сообщения")
        }
        let local = localID ?? UUID()
        let localFileURL = try savePendingAudio(data: audioData, localID: local)
        let optimistic = Message(
            id: Message.Identifier(chatID: chatID, messageID: local),
            localID: local,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .audio,
            text: "",
            createdAt: Date(),
            status: .sending,
            attachments: [
                MessageAttachment(
                    id: local,
                    kind: .audio,
                    url: nil,
                    localPath: localFileURL,
                    thumbnailURL: nil,
                    fileSize: Int64(audioData.count)
                )
            ]
        )
        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(message: optimistic, for: chatID)
        Task { [weak self] in
            await self?.attemptDelivery(of: optimistic)
        }
        return optimistic
    }

    public func editMessage(chatID: UUID, messageID: UUID, text: String) async throws -> Message {
        let updated = try await remote.editMessage(chatID: chatID, messageID: messageID, text: text).asDomainMessage()
        try await store.append(message: updated, for: chatID)
        return updated
    }

    public func deleteMessage(chatID: UUID, messageID: UUID) async throws -> Message {
        let deleted = try await remote.deleteMessage(chatID: chatID, messageID: messageID).asDomainMessage()
        try await store.append(message: deleted, for: chatID)
        return deleted
    }

    public func setTyping(chatID: UUID, isTyping: Bool) async {
        await realtime.setTyping(chatID: chatID, isTyping: isTyping)
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

    public func resetLocalState() async {
        do {
            try await store.reset()
        } catch {
            analytics.track(error: error, context: "reset_local_state")
        }
    }

    public func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {
        if status == .read {
            await realtime.markRead(chatID: chatID, messageID: messageID)
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
                deliveredMessage = try await realtime.sendMessage(
                    chatID: message.id.chatID,
                    kind: .text,
                    text: message.text,
                    mediaID: nil,
                    clientMessageID: message.localID
                )
            case .image, .audio:
                let attachmentKind: MessageAttachment.Kind = message.kind == .audio ? .audio : .image
                let mimeType = message.kind == .audio ? "audio/mp4" : "image/jpeg"
                let localFileURL = message.attachments.first(where: { $0.kind == attachmentKind })?.localPath
                guard let localFileURL else {
                    try await store.updateStatus(forLocalID: message.localID, in: message.id.chatID, status: .failed)
                    await pendingSendCoordinator.finish(localID: message.localID)
                    return
                }
                let data = try Data(contentsOf: localFileURL)
                let upload = try await remote.requestUploadURL(
                    mimeType: mimeType,
                    sizeBytes: data.count,
                    width: nil,
                    height: nil
                )
                let etag = try await remote.uploadImage(
                    to: upload.uploadURL,
                    data: data,
                    mimeType: mimeType
                )
                try await remote.confirmUpload(mediaID: upload.mediaID, etag: etag)
                deliveredMessage = try await realtime.sendMessage(
                    chatID: message.id.chatID,
                    kind: message.kind,
                    text: message.text.isEmpty ? nil : message.text,
                    mediaID: upload.mediaID,
                    clientMessageID: message.localID
                )
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
            case .chatCreated(let chat):
                try? await store.upsert(chats: [chat])
            case .chatDeleted:
                try? await store.removeChat(id: envelope.chatID)
            case .message(let message):
                guard message.id.chatID == envelope.chatID else { continue }
                try? await store.ensureChatExists(id: envelope.chatID, title: "Диалог")
                try? await store.append(message: message, for: envelope.chatID)
            case .messageUpdated(let message):
                guard message.id.chatID == envelope.chatID else { continue }
                try? await store.ensureChatExists(id: envelope.chatID, title: "Диалог")
                try? await store.append(message: message, for: envelope.chatID)
            case .messageDeleted(let message):
                guard message.id.chatID == envelope.chatID else { continue }
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

    private func observeRealtimeConnectionState() async {
        var hasObservedConnectedState = false
        for await state in realtime.observeConnectionState() {
            guard case .connected = state else { continue }

            if hasObservedConnectedState {
                let chatIDs = await activeChatSubscriptions.activeChatIDs()
                for chatID in chatIDs {
                    await synchronizeLatestMessages(
                        for: chatID,
                        context: "chat_reconnect_gap_sync"
                    )
                }
            }
            hasObservedConnectedState = true
        }
    }

    private func finishObservingMessages(chatID: UUID, token: UUID) async {
        guard await activeChatSubscriptions.remove(chatID: chatID, token: token) else {
            return
        }
        realtime.disconnect(from: chatID)
    }

    private func synchronizeLatestMessages(for chatID: UUID, context: String) async {
        guard await chatSyncCoordinator.begin(chatID: chatID) else { return }

        do {
            let messages = try await remote.loadMessages(
                chatID: chatID,
                limit: 200,
                before: nil
            ).map { $0.asDomainMessage() }
            let validatedMessages = messages.filter { $0.id.chatID == chatID }
            if !validatedMessages.isEmpty {
                try await store.ensureChatExists(id: chatID, title: "Диалог")
                try await store.upsert(messages: validatedMessages, for: chatID)
            }
        } catch {
            analytics.track(error: error, context: context)
        }

        await chatSyncCoordinator.finish(chatID: chatID)
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

    private func savePendingAudio(data: Data, localID: UUID) throws -> URL {
        let directory = pendingAudioDirectory()
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: nil
        )
        let url = directory.appendingPathComponent("\(localID.uuidString).m4a")
        try data.write(to: url, options: .atomic)
        return url
    }

    private func pendingAudioDirectory() -> URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ??
        URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        return appSupport.appendingPathComponent("MobileMessengerIOS/pending-audio", isDirectory: true)
    }
}

extension ServerChat {
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

private actor PendingSendCoordinator {
    private var inFlight: Set<UUID> = []

    func begin(localID: UUID) -> Bool {
        inFlight.insert(localID).inserted
    }

    func finish(localID: UUID) {
        inFlight.remove(localID)
    }
}

private actor ActiveChatSubscriptionRegistry {
    struct Registration: Sendable {
        let token: UUID
        let isFirstForChat: Bool
    }

    private var tokensByChatID: [UUID: Set<UUID>] = [:]

    func add(chatID: UUID) -> Registration {
        let token = UUID()
        let isFirstForChat = tokensByChatID[chatID]?.isEmpty != false
        tokensByChatID[chatID, default: []].insert(token)
        return Registration(token: token, isFirstForChat: isFirstForChat)
    }

    /// Returns true only when the removed token was the last observer for the chat.
    func remove(chatID: UUID, token: UUID) -> Bool {
        guard tokensByChatID[chatID]?.remove(token) != nil else { return false }
        guard tokensByChatID[chatID]?.isEmpty == true else { return false }
        tokensByChatID[chatID] = nil
        return true
    }

    func activeChatIDs() -> [UUID] {
        Array(tokensByChatID.keys)
    }
}

private actor ChatSyncCoordinator {
    private var inFlightChatIDs: Set<UUID> = []

    func begin(chatID: UUID) -> Bool {
        inFlightChatIDs.insert(chatID).inserted
    }

    func finish(chatID: UUID) {
        inFlightChatIDs.remove(chatID)
    }
}
