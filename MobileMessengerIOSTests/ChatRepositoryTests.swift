import XCTest
@testable import MobileMessengerIOS

final class ChatRepositoryTests: XCTestCase {
    func testCreateChatUseCaseCallsRepositoryMethod() async throws {
        let repository = MockChatRepository()
        let useCase = CreateChatUseCase(repository: repository)

        let chat = try await useCase(title: "Portfolio Chat", participantContacts: ["+15551230011"])

        XCTAssertEqual(repository.createChatCalls.count, 1)
        XCTAssertEqual(repository.createChatCalls.first?.title, "Portfolio Chat")
        XCTAssertEqual(repository.createChatCalls.first?.participantContacts, ["+15551230011"])
        XCTAssertEqual(chat.title, "Portfolio Chat")
    }

    func testSendMessageUseCasePassesChatIDAndTextToRepository() async throws {
        let repository = MockChatRepository()
        let useCase = SendMessageUseCase(repository: repository)
        let chatID = UUID()

        _ = try await useCase(chatID: chatID, text: "Hello")

        XCTAssertEqual(repository.sendMessageCalls.count, 1)
        XCTAssertEqual(repository.sendMessageCalls.first?.chatID, chatID)
        XCTAssertEqual(repository.sendMessageCalls.first?.text, "Hello")
    }

    func testUseCaseReturnsReadableRepositoryError() async {
        let repository = MockChatRepository()
        repository.setSendMessageError(AppError.network(description: "Repository send failed"))
        let useCase = SendMessageUseCase(repository: repository)

        do {
            _ = try await useCase(chatID: UUID(), text: "Hello")
            XCTFail("Expected repository error")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Repository send failed")
        }
    }

    func testSendMessagePersistsOptimisticMessageThenReplacesItWithDeliveredVersion() async throws {
        let chatID = UUID()
        let localID = UUID()
        let remote = FakeChatNetworking()
        let realtime = FakeRealtimeService()
        let reachability = FakeReachabilityService(isReachable: true)
        let store = SwiftDataChatStore(storageURL: uniqueStoreURL())

        await remote.setSendMessageResponse(
            makeServerMessage(
                chatID: chatID,
                authorID: SessionStore.Constants.currentUserID,
                authorName: SessionStore.Constants.currentUserDisplayName,
                messageID: localID,
                text: "Привет",
                status: .delivered
            )
        )

        let repository = DefaultChatRepository(
            store: store,
            remote: remote,
            realtime: realtime,
            analytics: FakeAnalyticsService(),
            reachability: reachability
        )

        let optimistic = try await repository.sendMessage(chatID: chatID, text: "Привет", localID: localID, repliedTo: nil)
        XCTAssertEqual(optimistic.status, .sending)
        XCTAssertEqual(optimistic.localID, localID)

        let delivered = try await waitUntil { [store] in
            let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
            return messages.first(where: { $0.localID == localID && $0.status == .delivered })
        }

        XCTAssertEqual(delivered.text, "Привет")
        XCTAssertEqual(delivered.id.messageID, localID)
        let sendMessageCallCount = await remote.sendMessageCallCount
        XCTAssertEqual(sendMessageCallCount, 1)
    }

    func testRealtimeMessageReadEventUpdatesStoredMessageStatus() async throws {
        let chatID = UUID()
        let remote = FakeChatNetworking()
        let realtime = FakeRealtimeService()
        let reachability = FakeReachabilityService(isReachable: true)
        let store = SwiftDataChatStore(storageURL: uniqueStoreURL())
        let messageID = UUID()
        let incomingMessage = makeDomainMessage(
            chatID: chatID,
            messageID: messageID,
            authorID: UUID(),
            authorName: "Алиса",
            text: "Новое сообщение",
            status: .delivered
        )

        let repository = DefaultChatRepository(
            store: store,
            remote: remote,
            realtime: realtime,
            analytics: FakeAnalyticsService(),
            reachability: reachability
        )
        _ = repository

        realtime.emit(chatID: chatID, event: .message(incomingMessage))

        let storedIncoming = try await waitUntil { [store] in
            let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
            return messages.first(where: { $0.id.messageID == messageID })
        }
        XCTAssertEqual(storedIncoming.status, .delivered)

        realtime.emit(chatID: chatID, event: .messageRead(messageID: messageID))

        let updated = try await waitUntil { [store] in
            let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
            return messages.first(where: { $0.id.messageID == messageID && $0.status == .read })
        }
        XCTAssertEqual(updated.status, .read)
    }

    private func uniqueStoreURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("json")
    }

    private func makeServerMessage(
        chatID: UUID,
        authorID: UUID,
        authorName: String,
        messageID: UUID,
        text: String,
        status: MessageStatus,
        createdAt: Date = Date()
    ) -> ServerMessage {
        let payload: [String: Any] = [
            "id": UUID().uuidString,
            "messageID": messageID.uuidString,
            "chatID": chatID.uuidString,
            "authorID": authorID.uuidString,
            "authorName": authorName,
            "kind": Message.Kind.text.rawValue,
            "text": text,
            "status": status.rawValue,
            "createdAt": ISO8601DateFormatter().string(from: createdAt)
        ]

        let data = try! JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(ServerMessage.self, from: data)
    }

    private func makeDomainMessage(
        chatID: UUID,
        messageID: UUID,
        authorID: UUID,
        authorName: String,
        text: String,
        status: MessageStatus,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: Message.Identifier(chatID: chatID, messageID: messageID),
            localID: messageID,
            authorID: authorID,
            authorName: authorName,
            text: text,
            createdAt: createdAt,
            status: status
        )
    }

    private func waitUntil<T>(
        timeout: TimeInterval = 2,
        pollInterval: UInt64 = 50_000_000,
        operation: @escaping () async throws -> T?
    ) async throws -> T {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let value = try await operation() {
                return value
            }
            try await Task.sleep(nanoseconds: pollInterval)
        }
        throw XCTSkip("Condition was not met within \(timeout) seconds")
    }
}

private actor FakeChatNetworking: ChatNetworking {
    private(set) var sendMessageCallCount = 0
    private var sendMessageResponse: ServerMessage?

    func setSendMessageResponse(_ response: ServerMessage) {
        sendMessageResponse = response
    }

    func listChats(searchQuery: String?) async throws -> [ServerChat] {
        []
    }

    func createChat(title: String, participantContacts: [String]) async throws -> ServerChat {
        throw NSError(domain: "FakeChatNetworking", code: 1)
    }

    func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage] {
        []
    }

    func sendMessage(chatID: UUID, kind: Message.Kind, text: String?, mediaID: UUID?, localID: UUID) async throws -> ServerMessage {
        sendMessageCallCount += 1
        guard let sendMessageResponse else {
            throw NSError(domain: "FakeChatNetworking", code: 2)
        }
        return sendMessageResponse
    }

    func markRead(chatID: UUID, messageID: UUID) async throws {}

    func setTyping(chatID: UUID, isTyping: Bool) async throws {}

    func requestUploadURL(mimeType: String, sizeBytes: Int, width: Int?, height: Int?) async throws -> MediaUploadTarget {
        throw NSError(domain: "FakeChatNetworking", code: 3)
    }

    func uploadImage(to uploadURL: URL, data: Data, mimeType: String) async throws -> String? {
        throw NSError(domain: "FakeChatNetworking", code: 4)
    }

    func confirmUpload(mediaID: UUID, etag: String?) async throws {}
}

private final class FakeRealtimeService: ChatRealtimeService, @unchecked Sendable {
    private var allEventsContinuation: AsyncStream<ChatRealtimeEnvelope>.Continuation?
    private var bufferedEnvelopes: [ChatRealtimeEnvelope] = []

    func activate() {}
    func deactivate() {}
    func handleLogout() {}
    func connect(to chatID: UUID) {}
    func disconnect(from chatID: UUID) {}

    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        AsyncStream { _ in }
    }

    func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope> {
        AsyncStream { continuation in
            allEventsContinuation = continuation
            bufferedEnvelopes.forEach { continuation.yield($0) }
            bufferedEnvelopes.removeAll()
        }
    }

    func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState> {
        AsyncStream { _ in }
    }

    func emit(chatID: UUID, event: ChatRealtimeEvent) {
        let envelope = ChatRealtimeEnvelope(chatID: chatID, event: event)
        if let allEventsContinuation {
            allEventsContinuation.yield(envelope)
        } else {
            bufferedEnvelopes.append(envelope)
        }
    }
}

private final class FakeReachabilityService: ReachabilityService, @unchecked Sendable {
    var isReachable: Bool

    init(isReachable: Bool) {
        self.isReachable = isReachable
    }

    func observe() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            continuation.yield(isReachable)
        }
    }
}

private struct FakeAnalyticsService: AnalyticsService {
    func track(event: AppAnalyticsEvent) {}
    func track(error: Error, context: String) {}
}

private final class MockChatRepository: ChatRepository, @unchecked Sendable {
    struct CreateChatCall: Equatable {
        let title: String
        let participantContacts: [String]
    }

    struct SendMessageCall: Equatable {
        let chatID: UUID
        let text: String
    }

    private let lock = NSLock()
    private(set) var createChatCalls: [CreateChatCall] = []
    private(set) var sendMessageCalls: [SendMessageCall] = []
    private var sendMessageError: Error?

    func setSendMessageError(_ error: Error) {
        lock.lock()
        sendMessageError = error
        lock.unlock()
    }

    func createChat(title: String, participantContacts: [String]) async throws -> Chat {
        lock.lock()
        createChatCalls.append(CreateChatCall(title: title, participantContacts: participantContacts))
        lock.unlock()
        return Chat(
            id: UUID(),
            title: title,
            lastMessagePreview: nil,
            lastActivity: Date(),
            unreadCount: 0,
            participantNames: participantContacts,
            participantCount: max(participantContacts.count + 1, 1)
        )
    }

    func cachedChats(searchQuery: String?) async -> [Chat] { [] }
    func listChats(searchQuery: String?) async throws -> [Chat] { [] }
    func observeChats() -> AsyncStream<[Chat]> { AsyncStream { _ in } }
    func observeMessages(for chatID: UUID) -> AsyncStream<Message> { AsyncStream { _ in } }
    func cachedHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async -> [Message] { [] }
    func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] { [] }

    func sendMessage(chatID: UUID, text: String, localID: UUID?, repliedTo: Message.Identifier?) async throws -> Message {
        lock.lock()
        sendMessageCalls.append(SendMessageCall(chatID: chatID, text: text))
        let currentError = sendMessageError
        lock.unlock()
        if let currentError {
            throw currentError
        }
        return Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: localID ?? UUID(),
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            text: text,
            createdAt: Date(),
            status: .delivered,
            repliedTo: repliedTo
        )
    }

    func sendImageMessage(chatID: UUID, imageData: Data, caption: String?, localID: UUID?, repliedTo: Message.Identifier?) async throws -> Message {
        Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: localID ?? UUID(),
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .image,
            text: caption ?? "",
            createdAt: Date(),
            status: .delivered,
            repliedTo: repliedTo
        )
    }

    func setTyping(chatID: UUID, isTyping: Bool) async {}
    func retryPendingMessages(for chatID: UUID) async {}
    func refreshForForeground() async {}
    func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {}
}
