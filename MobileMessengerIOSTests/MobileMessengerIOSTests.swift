import XCTest
@testable import MobileMessengerIOS

@MainActor
final class ChatViewModelTests: XCTestCase {
    override func setUp() {
        super.setUp()
        SessionStore.Constants.currentUserID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        SessionStore.Constants.currentUserDisplayName = "Вы"
    }

    func testSendMessageShowsOfflineBannerAndKeepsOptimisticMessage() async {
        let repository = ChatRepositorySpy()
        let reachability = ReachabilityServiceStub(isReachable: false)
        let sentMessage = makeOutgoingMessage(status: .sending, text: "Привет офлайн")
        repository.sendMessageResult = sentMessage

        let viewModel = ChatViewModel(
            chatID: sentMessage.id.chatID,
            title: "Offline Chat",
            observeMessages: ObserveChatMessagesUseCase(repository: repository),
            loadHistory: LoadChatHistoryUseCase(repository: repository),
            sendMessage: SendMessageUseCase(repository: repository),
            sendImageMessage: SendImageMessageUseCase(repository: repository),
            setTyping: SetTypingUseCase(repository: repository),
            retryPending: RetryPendingMessagesUseCase(repository: repository),
            markStatus: MarkMessageStatusUseCase(repository: repository),
            analytics: AnalyticsServiceSpy(),
            notificationManager: PushNotificationManager.shared,
            reachability: reachability
        )

        viewModel.onAppear()
        await Task.yield()

        let sendExpectation = expectation(description: "send message invoked")
        repository.onSendMessage = { _, _, _ in
            sendExpectation.fulfill()
        }

        viewModel.inputText = sentMessage.text
        viewModel.sendMessage()

        await fulfillment(of: [sendExpectation], timeout: 1.0)
        await Task.yield()

        XCTAssertEqual(viewModel.messages.count, 1)
        XCTAssertEqual(viewModel.messages.first?.localID, sentMessage.localID)
        XCTAssertEqual(viewModel.messages.first?.status, .sending)
        XCTAssertEqual(viewModel.inputText, "")

        guard case .offline? = viewModel.banner else {
            return XCTFail("Expected offline banner")
        }
    }

    private func makeOutgoingMessage(status: MessageStatus, text: String) -> Message {
        let chatID = UUID()
        let localID = UUID()
        return Message(
            id: Message.Identifier(chatID: chatID, messageID: localID),
            localID: localID,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .text,
            text: text,
            createdAt: Date(),
            status: status
        )
    }
}

@MainActor
final class ChatListViewModelTests: XCTestCase {
    func testCreateChatDeduplicatesExistingChatByIdentifier() async {
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        let contactsService = ContactsServiceStub()
        let existingChat = Chat(
            id: UUID(),
            title: "Борис Demo",
            lastMessagePreview: "Привет",
            lastActivity: Date(),
            unreadCount: 0,
            typingParticipants: [],
            participantNames: ["Борис Demo"],
            participantCount: 2
        )

        repository.listChatsResult = [existingChat]
        repository.createChatResult = existingChat

        let viewModel = ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: repository),
            observeChats: ObserveChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            contactsService: contactsService,
            analytics: analytics
        )

        await viewModel.refresh()
        XCTAssertEqual(viewModel.chats.count, 1)

        let created = await viewModel.createChat(
            title: existingChat.title,
            participantContacts: ["+15551230012"]
        )

        XCTAssertEqual(created?.id, existingChat.id)
        XCTAssertEqual(viewModel.chats.count, 1)
        XCTAssertEqual(viewModel.chats.first?.title, existingChat.title)
    }

    func testLoadCreateContactsFiltersCurrentUserAndSortsAlphabetically() async {
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        let contactsService = ContactsServiceStub(contacts: [
            makeContact(displayName: "Глеб Demo", isCurrentUser: false),
            makeContact(displayName: "Анна Demo", isCurrentUser: false),
            makeContact(displayName: "Вы", isCurrentUser: true)
        ])

        let viewModel = ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: repository),
            observeChats: ObserveChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            contactsService: contactsService,
            analytics: analytics
        )

        await viewModel.loadCreateContactsIfNeeded()

        XCTAssertEqual(viewModel.availableContacts.map(\.displayName), ["Анна Demo", "Глеб Demo"])
        XCTAssertNil(viewModel.createContactsError)
    }

    func testSearchQueryFiltersLoadedChatsImmediately() async {
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        let contactsService = ContactsServiceStub()
        let now = Date()
        repository.listChatsResult = [
            Chat(
                id: UUID(),
                title: "Борис Demo",
                lastMessagePreview: "Привет",
                lastActivity: now,
                unreadCount: 0,
                participantNames: ["Борис Demo"],
                participantCount: 2
            ),
            Chat(
                id: UUID(),
                title: "Анна Demo",
                lastMessagePreview: "Пока",
                lastActivity: now.addingTimeInterval(-60),
                unreadCount: 0,
                participantNames: ["Анна Demo"],
                participantCount: 2
            )
        ]

        let viewModel = ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: repository),
            observeChats: ObserveChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            contactsService: contactsService,
            analytics: analytics
        )

        await viewModel.refresh()
        viewModel.searchQuery = "борис"

        XCTAssertEqual(viewModel.chats.count, 1)
        XCTAssertEqual(viewModel.chats.first?.title, "Борис Demo")
    }

    private func makeContact(displayName: String, isCurrentUser: Bool) -> ContactDTO {
        ContactDTO(
            userID: UUID(),
            displayName: displayName,
            contact: "+15550000000",
            isCurrentUser: isCurrentUser
        )
    }
}

@MainActor
final class AuthViewModelTests: XCTestCase {
    func testRequestCodeSanitizesPhoneAndStoresExpiration() async throws {
        let authService = AuthServiceSpy()
        let sessionStore = makeSessionStore()
        let viewModel = AuthViewModel(authService: authService, sessionStore: sessionStore)
        viewModel.method = .phone
        viewModel.contact = " +1 (555) 123-0011 "

        await viewModel.requestCode()

        let request = await authService.lastRequestCodeInput
        XCTAssertEqual(request?.contact, "+15551230011")
        XCTAssertTrue(viewModel.isCodeSent)
        XCTAssertEqual(viewModel.codeExpirationSeconds, 300)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testSetScreenModeToSignUpSwitchesToCodeFlowAndClearsPassword() {
        let viewModel = AuthViewModel(authService: AuthServiceSpy(), sessionStore: makeSessionStore())
        viewModel.password = "demo1111"
        viewModel.code = "1234"
        viewModel.errorMessage = "Ошибка"
        viewModel.isCodeSent = true

        viewModel.setScreenMode(.signUp)

        XCTAssertEqual(viewModel.screenMode, .signUp)
        XCTAssertEqual(viewModel.credentialMode, .code)
        XCTAssertEqual(viewModel.password, "")
        XCTAssertEqual(viewModel.code, "")
        XCTAssertFalse(viewModel.isCodeSent)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testSignInDemoAccountAuthenticatesSession() async {
        let authService = AuthServiceSpy()
        let sessionStore = makeSessionStore()
        let viewModel = AuthViewModel(authService: authService, sessionStore: sessionStore)
        let account = viewModel.demoAccounts[1]

        await viewModel.signInDemoAccount(account)

        let signIn = await authService.lastSignInInput
        XCTAssertEqual(signIn?.contact, account.contact)
        XCTAssertEqual(signIn?.password, account.password)

        guard case .authenticated(let token, let userID, let displayName) = sessionStore.state else {
            return XCTFail("Expected authenticated state")
        }

        XCTAssertEqual(token, "test-token")
        XCTAssertEqual(userID, UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))
        XCTAssertEqual(displayName, "Анна Demo")
    }

    private func makeSessionStore() -> SessionStore {
        SessionStore(tokenStore: InMemoryTokenStore(), defaults: UserDefaults(suiteName: UUID().uuidString)!)
    }
}

final class TransportDecodingTests: XCTestCase {
    func testAuthVerifyResponseDecodesVerifyPayload() throws {
        let userID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!
        let payload = """
        {
          "token": "demo-token",
          "userID": "\(userID.uuidString)",
          "displayName": "Анна Demo",
          "phone": "+15551230011"
        }
        """

        let response = try JSONDecoder().decode(AuthVerifyResponse.self, from: Data(payload.utf8))

        XCTAssertEqual(response.token, "demo-token")
        XCTAssertEqual(response.userID, userID)
        XCTAssertEqual(response.displayName, "Анна Demo")
        XCTAssertEqual(response.phone, "+15551230011")
    }

    func testServerChatDecodesProductionDTOFields() throws {
        let chatID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE01")!
        let payload = """
        {
          "id": "\(chatID.uuidString)",
          "title": "Demo Team",
          "participants": ["Анна Demo", "Борис Demo", "Глеб Demo"],
          "lastMessage": "Всем привет",
          "updatedAt": "2026-04-24T12:34:56.789Z"
        }
        """

        let chat = try JSONDecoder.mobileMessengerISO8601().decode(ServerChat.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.fractional.date(from: "2026-04-24T12:34:56.789Z"))

        XCTAssertEqual(chat.id, chatID)
        XCTAssertEqual(chat.title, "Demo Team")
        XCTAssertEqual(chat.participantNames, ["Анна Demo", "Борис Demo", "Глеб Demo"])
        XCTAssertEqual(chat.lastMessagePreview, "Всем привет")
        XCTAssertEqual(chat.participantCount, 3)
        XCTAssertEqual(chat.lastActivity, expectedDate)
    }

    func testServerMessageDecodesProductionDTOFields() throws {
        let messageID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE02")!
        let chatID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE03")!
        let senderID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE04")!
        let clientMessageID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEE05")!
        let payload = """
        {
          "id": "\(messageID.uuidString)",
          "chatID": "\(chatID.uuidString)",
          "senderID": "\(senderID.uuidString)",
          "senderName": "Борис Demo",
          "kind": "text",
          "text": "Привет из websocket",
          "createdAt": "2026-04-24T12:34:56Z",
          "clientMessageId": "\(clientMessageID.uuidString)"
        }
        """

        let message = try JSONDecoder.mobileMessengerISO8601().decode(ServerMessage.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.basic.date(from: "2026-04-24T12:34:56Z"))

        XCTAssertEqual(message.id, messageID)
        XCTAssertEqual(message.chatID, chatID)
        XCTAssertEqual(message.authorID, senderID)
        XCTAssertEqual(message.authorName, "Борис Demo")
        XCTAssertEqual(message.text, "Привет из websocket")
        XCTAssertEqual(message.messageID, clientMessageID)
        XCTAssertEqual(message.createdAt, expectedDate)
    }

    func testSharedDecoderSupportsISO8601WithoutFractionalSeconds() throws {
        struct Payload: Decodable { let createdAt: Date }
        let payload = #"{"createdAt":"2026-04-24T12:34:56Z"}"#

        let decoded = try JSONDecoder.mobileMessengerISO8601().decode(Payload.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.basic.date(from: "2026-04-24T12:34:56Z"))

        XCTAssertEqual(decoded.createdAt, expectedDate)
    }

    func testSharedDecoderSupportsISO8601WithFractionalSeconds() throws {
        struct Payload: Decodable { let createdAt: Date }
        let payload = #"{"createdAt":"2026-04-24T12:34:56.789Z"}"#

        let decoded = try JSONDecoder.mobileMessengerISO8601().decode(Payload.self, from: Data(payload.utf8))
        let expectedDate = try XCTUnwrap(ISO8601DateFormatter.fractional.date(from: "2026-04-24T12:34:56.789Z"))

        XCTAssertEqual(decoded.createdAt, expectedDate)
    }
}

@MainActor
final class RealtimeServiceTests: XCTestCase {
    func testWebSocketEventDecodingWorks() async throws {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        let chatID = UUID()

        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        socket.enqueue(text: #"{"event":"typing.started","data":{"chatID":"\#(chatID.uuidString)","userID":"11111111-2222-3333-4444-555555555555","displayName":"Анна","isTyping":true,"typingParticipants":["Анна"]}}"#)

        let stream = service.observeAllEvents()
        service.activate()

        let envelope = await nextEnvelope(from: stream)
        if case .typing(let participants) = envelope?.event {
            XCTAssertEqual(envelope?.chatID, chatID)
            XCTAssertEqual(participants, ["Анна"])
        } else {
            XCTFail("Expected typing event")
        }
    }

    func testMessageCreatedDecodeWorks() async throws {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        let chatID = UUID()
        let serverID = UUID()
        let clientMessageID = UUID()

        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        socket.enqueue(text: #"{"event":"message.created","data":{"chatID":"\#(chatID.uuidString)","message":{"id":"\#(serverID.uuidString)","messageID":"\#(clientMessageID.uuidString)","chatID":"\#(chatID.uuidString)","authorID":"11111111-2222-3333-4444-555555555555","authorName":"Анна Demo","kind":"text","text":"Привет","mediaID":null,"mediaURL":null,"status":"delivered","createdAt":"2026-04-24T12:00:00.000Z"}}}"#)

        let stream = service.observeAllEvents()
        service.activate()

        let envelope = await nextEnvelope(from: stream)
        guard case .message(let message)? = envelope?.event else {
            return XCTFail("Expected message event")
        }

        XCTAssertEqual(message.id.chatID, chatID)
        XCTAssertEqual(message.id.messageID, serverID)
        XCTAssertEqual(message.localID, clientMessageID)
        XCTAssertEqual(message.text, "Привет")
    }

    func testMessageAckMarksPendingMessageSent() async throws {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        let chatID = UUID()
        let serverID = UUID()
        let clientMessageID = UUID()

        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        let sendTask = Task {
            try await service.sendMessage(
                chatID: chatID,
                kind: .text,
                text: "Привет",
                mediaID: nil,
                clientMessageID: clientMessageID
            )
        }

        socket.enqueue(text: #"{"event":"message.send.ack","data":{"chatID":"\#(chatID.uuidString)","clientMessageId":"\#(clientMessageID.uuidString)","message":{"id":"\#(serverID.uuidString)","messageID":"\#(clientMessageID.uuidString)","chatID":"\#(chatID.uuidString)","authorID":"11111111-2222-3333-4444-555555555555","authorName":"Анна Demo","kind":"text","text":"Привет","mediaID":null,"mediaURL":null,"status":"delivered","createdAt":"2026-04-24T12:00:00.000Z"}}}"#)

        let message = try await sendTask.value
        XCTAssertEqual(message.id.messageID, serverID)
        XCTAssertEqual(message.localID, clientMessageID)
        XCTAssertEqual(message.status, .sent)
    }

    func testLogoutClosesRealtimeConnection() async throws {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        service.handleLogout()
        let cancelCount = await waitForCancelCount(on: socket)
        XCTAssertEqual(cancelCount, 1)
    }

    func testManualDisconnectDoesNotReconnect() async throws {
        let socket = FakeRealtimeSocketTask()
        var factoryCalls = 0
        let service = makeRealtimeService(socket: socket) { request in
            _ = request
            factoryCalls += 1
            return socket
        }
        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        service.deactivate()
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(factoryCalls, 1)
    }

    func testLogoutPreventsReconnectAndStaleSocketReuse() async throws {
        let firstSocket = FakeRealtimeSocketTask()
        let secondSocket = FakeRealtimeSocketTask()
        var factoryCalls = 0
        let service = DefaultChatRealtimeService(
            websocketURL: URL(string: "ws://localhost/realtime")!,
            authTokenProvider: { "test-token" },
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: true,
                isMediaEnabled: true,
                isLoggingVerbose: false
            ),
            maxReconnectDelay: 0.01,
            heartbeatInterval: 10,
            sleep: { nanoseconds in
                try? await Task.sleep(nanoseconds: min(nanoseconds, 20_000_000))
            },
            socketFactory: { _ in
                defer { factoryCalls += 1 }
                return factoryCalls == 0 ? firstSocket : secondSocket
            }
        )

        firstSocket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        service.handleLogout()
        firstSocket.enqueue(error: AppError.network(description: "late disconnect"))
        try? await Task.sleep(nanoseconds: 200_000_000)
        let firstCancelCount = await firstSocket.cancelCount
        let secondCancelCount = await secondSocket.cancelCount

        XCTAssertEqual(factoryCalls, 1)
        XCTAssertEqual(firstCancelCount, 1)
        XCTAssertEqual(secondCancelCount, 0)
    }

    func testPingFailureTriggersReconnect() async throws {
        let firstSocket = FakeRealtimeSocketTask()
        firstSocket.pingError = AppError.network(description: "Ping failed")
        let secondSocket = FakeRealtimeSocketTask()
        secondSocket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        var factoryCalls = 0
        let service = DefaultChatRealtimeService(
            websocketURL: URL(string: "ws://localhost/realtime")!,
            authTokenProvider: { "test-token" },
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: true,
                isMediaEnabled: true,
                isLoggingVerbose: false
            ),
            maxReconnectDelay: 0.01,
            heartbeatInterval: 0.01,
            sleep: { nanoseconds in
                try? await Task.sleep(nanoseconds: min(nanoseconds, 20_000_000))
            },
            socketFactory: { _ in
                defer { factoryCalls += 1 }
                return factoryCalls == 0 ? firstSocket : secondSocket
            }
        )

        firstSocket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        service.activate()
        let reconnectedState = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state, factoryCalls >= 2 {
                return true
            }
            return false
        })

        XCTAssertNotNil(reconnectedState)
        XCTAssertGreaterThanOrEqual(factoryCalls, 2)
    }

    private func makeRealtimeService(
        socket: FakeRealtimeSocketTask,
        factory: (@Sendable (URLRequest) -> RealtimeSocketTask)? = nil
    ) -> DefaultChatRealtimeService {
        DefaultChatRealtimeService(
            websocketURL: URL(string: "ws://localhost/realtime")!,
            authTokenProvider: { "test-token" },
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: true,
                isMediaEnabled: true,
                isLoggingVerbose: false
            ),
            sleep: { _ in },
            socketFactory: factory ?? { _ in socket }
        )
    }

    private func nextEnvelope(
        from stream: AsyncStream<ChatRealtimeEnvelope>
    ) async -> ChatRealtimeEnvelope? {
        var iterator = stream.makeAsyncIterator()
        while let value = await iterator.next() {
            switch value.event {
            case .connected, .disconnected:
                continue
            case .message, .messageRead, .typing:
                return value
            }
        }
        return nil
    }

    private func nextState(
        from stream: AsyncStream<ChatRealtimeConnectionState>,
        matching predicate: @escaping (ChatRealtimeConnectionState) -> Bool
    ) async -> ChatRealtimeConnectionState? {
        var iterator = stream.makeAsyncIterator()
        while let state = await iterator.next() {
            if predicate(state) {
                return state
            }
        }
        return nil
    }

    private func waitForCancelCount(on socket: FakeRealtimeSocketTask) async -> Int {
        for _ in 0..<20 {
            let count = await socket.cancelCount
            if count > 0 {
                return count
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return await socket.cancelCount
    }
}

@MainActor
final class ChatStorageAndRepositoryTests: XCTestCase {
    func testDuplicateMessageIsIgnored() async throws {
        let store = SwiftDataChatStore(storageURL: temporaryStoreURL())
        let chatID = UUID()
        let serverID = UUID()
        let localID = UUID()

        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(
            message: Message(
                id: Message.Identifier(chatID: chatID, messageID: serverID),
                localID: localID,
                authorID: UUID(),
                authorName: "Анна",
                kind: .text,
                text: "One",
                createdAt: Date(),
                status: .sending
            ),
            for: chatID
        )
        try await store.append(
            message: Message(
                id: Message.Identifier(chatID: chatID, messageID: serverID),
                localID: localID,
                authorID: UUID(),
                authorName: "Анна",
                kind: .text,
                text: "Two",
                createdAt: Date(),
                status: .sent
            ),
            for: chatID
        )

        let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages.first?.text, "Two")
        XCTAssertEqual(messages.first?.status, .sent)
    }

    func testDuplicateClientMessageIdentifierIsIgnored() async throws {
        let store = SwiftDataChatStore(storageURL: temporaryStoreURL())
        let chatID = UUID()
        let firstServerID = UUID()
        let secondServerID = UUID()
        let localID = UUID()

        try await store.ensureChatExists(id: chatID, title: "Диалог")
        try await store.append(
            message: Message(
                id: Message.Identifier(chatID: chatID, messageID: firstServerID),
                localID: localID,
                authorID: UUID(),
                authorName: "Анна",
                kind: .text,
                text: "First",
                createdAt: Date(),
                status: .sending
            ),
            for: chatID
        )
        try await store.append(
            message: Message(
                id: Message.Identifier(chatID: chatID, messageID: secondServerID),
                localID: localID,
                authorID: UUID(),
                authorName: "Анна",
                kind: .text,
                text: "Second",
                createdAt: Date().addingTimeInterval(1),
                status: .sent
            ),
            for: chatID
        )

        let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages.first?.id.messageID, secondServerID)
        XCTAssertEqual(messages.first?.text, "Second")
    }

    func testFailedSendChangesMessageStateToFailed() async throws {
        let store = SwiftDataChatStore(storageURL: temporaryStoreURL())
        let realtime = RealtimeServiceStub(sendError: AppError.network(description: "ws down"))
        let repository = DefaultChatRepository(
            store: store,
            remote: ChatNetworkingStub(),
            realtime: realtime,
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true)
        )

        let chatID = UUID()
        _ = try await repository.sendMessage(chatID: chatID, text: "Fail me", localID: UUID())

        let messages = try await waitForMessages(in: store, chatID: chatID)
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages.first?.status, .failed)
    }

    func testRetryFailedMessageDoesNotCreateDuplicate() async throws {
        SessionStore.Constants.currentUserID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        SessionStore.Constants.currentUserDisplayName = "Вы"
        let store = SwiftDataChatStore(storageURL: temporaryStoreURL())
        let realtime = SequencedRealtimeServiceStub(
            outcomes: [
                .failure(AppError.network(description: "ws down")),
                .success(
                    Message(
                        id: Message.Identifier(chatID: UUID(), messageID: UUID()),
                        localID: UUID(),
                        authorID: SessionStore.Constants.currentUserID,
                        authorName: SessionStore.Constants.currentUserDisplayName,
                        kind: .text,
                        text: "Recovered",
                        createdAt: Date(),
                        status: .sent
                    )
                )
            ]
        )
        let repository = DefaultChatRepository(
            store: store,
            remote: ChatNetworkingStub(),
            realtime: realtime,
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true)
        )

        let chatID = UUID()
        let localID = UUID()
        let optimistic = try await repository.sendMessage(chatID: chatID, text: "Recovered", localID: localID)
        _ = optimistic

        let failedMessages = try await waitForMessages(in: store, chatID: chatID)
        XCTAssertEqual(failedMessages.count, 1)
        XCTAssertEqual(failedMessages.first?.status, .failed)

        let serverMessage = Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: localID,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .text,
            text: "Recovered",
            createdAt: Date().addingTimeInterval(1),
            status: .sent
        )
        realtime.replaceNextSuccess(with: serverMessage)
        await repository.retryPendingMessages(for: chatID)

        let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages.first?.localID, localID)
        XCTAssertEqual(messages.first?.status, .sent)
        XCTAssertEqual(messages.first?.text, "Recovered")
    }

    func testSessionLogoutClearsTokenAndUserIdentity() {
        let tokenStore = InMemoryTokenStore()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let sessionStore = SessionStore(tokenStore: tokenStore, defaults: defaults)
        let userID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!

        sessionStore.authenticate(with: "demo-token", userID: userID, displayName: "Анна Demo")
        sessionStore.logout()

        XCTAssertNil(tokenStore.retrieveToken())
        XCTAssertNil(sessionStore.authToken)
        XCTAssertNil(sessionStore.currentUserID)
        XCTAssertEqual(sessionStore.state, .unauthenticated)
    }

    func testUserSwitchClearsOldChatsBeforeLoadingNextAccount() async throws {
        let tokenStore = InMemoryTokenStore()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let sessionStore = SessionStore(tokenStore: tokenStore, defaults: defaults)
        let store = SwiftDataChatStore(storageURL: temporaryStoreURL())
        let chatID = UUID()
        let userA = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!
        let userB = UUID(uuidString: "BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF")!

        sessionStore.authenticate(with: "token-a", userID: userA, displayName: "Анна Demo")
        try await store.ensureChatExists(id: chatID, title: "Анна и Борис")
        try await store.append(
            message: Message(
                id: Message.Identifier(chatID: chatID, messageID: UUID()),
                localID: UUID(),
                authorID: userA,
                authorName: "Анна Demo",
                kind: .text,
                text: "A only",
                createdAt: Date(),
                status: .sent
            ),
            for: chatID
        )

        sessionStore.logout()
        try await store.reset()
        sessionStore.authenticate(with: "token-b", userID: userB, displayName: "Борис Demo")
        let chats = try await store.fetchChats(searchQuery: nil)
        let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)

        XCTAssertTrue(chats.isEmpty)
        XCTAssertTrue(messages.isEmpty)
        XCTAssertEqual(sessionStore.currentUserID, userB)
    }

    private func temporaryStoreURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("json")
    }

    private func waitForMessages(
        in store: SwiftDataChatStore,
        chatID: UUID
    ) async throws -> [Message] {
        for _ in 0..<20 {
            let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
            if let first = messages.first, first.status == .failed {
                return messages
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return try await store.loadMessages(for: chatID, limit: 10, before: nil)
    }
}

private final class ChatRepositorySpy: ChatRepository {
    var cachedChatsResult: [Chat] = []
    var listChatsResult: [Chat] = []
    var createChatResult = Chat(
        id: UUID(),
        title: "Chat",
        lastMessagePreview: nil,
        lastActivity: Date(),
        unreadCount: 0
    )
    var sendMessageResult = Message(
        id: Message.Identifier(chatID: UUID(), messageID: UUID()),
        localID: UUID(),
        authorID: SessionStore.Constants.currentUserID,
        authorName: SessionStore.Constants.currentUserDisplayName,
        kind: .text,
        text: "",
        createdAt: Date(),
        status: .sending
    )
    var historyResult: [Message] = []
    var observedChats: AsyncStream<[Chat]> = AsyncStream { continuation in
        continuation.finish()
    }
    var observedMessages: AsyncStream<Message> = AsyncStream { continuation in
        continuation.finish()
    }
    var onSendMessage: ((UUID, String, UUID?) -> Void)?

    func createChat(title: String, participantContacts: [String]) async throws -> Chat {
        createChatResult
    }

    func cachedChats(searchQuery: String?) async -> [Chat] {
        cachedChatsResult
    }

    func listChats(searchQuery: String?) async throws -> [Chat] {
        listChatsResult
    }

    func observeChats() -> AsyncStream<[Chat]> {
        observedChats
    }

    func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        observedMessages
    }

    func cachedHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async -> [Message] {
        historyResult
    }

    func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        historyResult
    }

    func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message {
        onSendMessage?(chatID, text, localID)
        return sendMessageResult
    }

    func sendImageMessage(chatID: UUID, imageData: Data, caption: String?, localID: UUID?) async throws -> Message {
        sendMessageResult
    }

    func setTyping(chatID: UUID, isTyping: Bool) async {}

    func retryPendingMessages(for chatID: UUID) async {}

    func refreshForForeground() async {}

    func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws {}

    func resetLocalState() async {}
}

private final class FakeRealtimeSocketTask: RealtimeSocketTask {
    private actor State {
        var queued: [Result<URLSessionWebSocketTask.Message, Error>] = []
        var waiters: [CheckedContinuation<Result<URLSessionWebSocketTask.Message, Error>, Never>] = []
        var cancelCount = 0
        var pingCount = 0

        func enqueue(_ item: Result<URLSessionWebSocketTask.Message, Error>) {
            if let waiter = waiters.first {
                waiters.removeFirst()
                waiter.resume(returning: item)
            } else {
                queued.append(item)
            }
        }

        func next() async -> Result<URLSessionWebSocketTask.Message, Error> {
            if !queued.isEmpty {
                return queued.removeFirst()
            }

            return await withCheckedContinuation { continuation in
                waiters.append(continuation)
            }
        }

        func recordCancel() {
            cancelCount += 1
            enqueue(.failure(CancellationError()))
        }

        func recordPing() {
            pingCount += 1
        }
    }

    private let state = State()
    var pingError: Error?

    var cancelCount: Int {
        get async { await state.cancelCount }
    }

    var pingCount: Int {
        get async { await state.pingCount }
    }

    func enqueue(text: String) {
        Task {
            await state.enqueue(.success(.string(text)))
        }
    }

    func enqueue(error: Error) {
        Task {
            await state.enqueue(.failure(error))
        }
    }

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        _ = closeCode
        _ = reason
        Task { await state.recordCancel() }
    }

    func send(_ message: URLSessionWebSocketTask.Message) async throws {
        _ = message
    }

    func receive() async throws -> URLSessionWebSocketTask.Message {
        switch await state.next() {
        case .success(let message):
            return message
        case .failure(let error):
            throw error
        }
    }

    func sendPing() async throws {
        await state.recordPing()
        if let pingError {
            throw pingError
        }
    }
}

private struct RealtimeServiceStub: ChatRealtimeService {
    var sendError: Error?

    func activate() {}
    func deactivate() {}
    func handleLogout() {}
    func connect(to chatID: UUID) { _ = chatID }
    func disconnect(from chatID: UUID) { _ = chatID }
    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        _ = chatID
        return AsyncStream { continuation in continuation.finish() }
    }
    func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope> {
        AsyncStream { continuation in continuation.finish() }
    }
    func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState> {
        AsyncStream { continuation in
            continuation.yield(.connected)
            continuation.finish()
        }
    }
    func sendMessage(
        chatID: UUID,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        clientMessageID: UUID
    ) async throws -> Message {
        _ = chatID
        _ = kind
        _ = text
        _ = mediaID
        if let sendError {
            throw sendError
        }
        return Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: clientMessageID,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: kind,
            text: text ?? "",
            createdAt: Date(),
            status: .delivered
        )
    }
    func setTyping(chatID: UUID, isTyping: Bool) async {
        _ = chatID
        _ = isTyping
    }
    func markRead(chatID: UUID, messageID: UUID) async {
        _ = chatID
        _ = messageID
    }
}

private final class SequencedRealtimeServiceStub: ChatRealtimeService, @unchecked Sendable {
    private let lock = NSLock()
    private var outcomes: [Result<Message, Error>]

    init(outcomes: [Result<Message, Error>]) {
        self.outcomes = outcomes
    }

    func replaceNextSuccess(with message: Message) {
        lock.lock()
        defer { lock.unlock() }
        if outcomes.count > 1 {
            outcomes[1] = .success(message)
        } else {
            outcomes.append(.success(message))
        }
    }

    func activate() {}
    func deactivate() {}
    func handleLogout() {}
    func connect(to chatID: UUID) { _ = chatID }
    func disconnect(from chatID: UUID) { _ = chatID }
    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        _ = chatID
        return AsyncStream { continuation in continuation.finish() }
    }
    func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope> {
        AsyncStream { continuation in continuation.finish() }
    }
    func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState> {
        AsyncStream { continuation in
            continuation.yield(.connected)
            continuation.finish()
        }
    }
    func sendMessage(
        chatID: UUID,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        clientMessageID: UUID
    ) async throws -> Message {
        _ = kind
        _ = mediaID
        lock.lock()
        let next = outcomes.isEmpty ? Result<Message, Error>.failure(AppError.unknown) : outcomes.removeFirst()
        lock.unlock()
        switch next {
        case .success(let message):
            return Message(
                id: message.id,
                localID: clientMessageID,
                authorID: message.authorID,
                authorName: message.authorName,
                kind: message.kind,
                text: text ?? message.text,
                mediaID: message.mediaID,
                createdAt: message.createdAt,
                status: message.status,
                attachments: message.attachments
            )
        case .failure(let error):
            throw error
        }
    }
    func setTyping(chatID: UUID, isTyping: Bool) async {
        _ = chatID
        _ = isTyping
    }
    func markRead(chatID: UUID, messageID: UUID) async {
        _ = chatID
        _ = messageID
    }
}

private struct ChatNetworkingStub: ChatNetworking {
    func listChats(searchQuery: String?) async throws -> [ServerChat] {
        _ = searchQuery
        return []
    }

    func createChat(title: String, participantContacts: [String]) async throws -> ServerChat {
        _ = title
        _ = participantContacts
        throw AppError.unknown
    }

    func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage] {
        _ = chatID
        _ = limit
        _ = messageID
        return []
    }

    func sendMessage(chatID: UUID, kind: Message.Kind, text: String?, mediaID: UUID?, localID: UUID) async throws -> ServerMessage {
        _ = chatID
        _ = kind
        _ = text
        _ = mediaID
        _ = localID
        throw AppError.unknown
    }

    func markRead(chatID: UUID, messageID: UUID) async throws {
        _ = chatID
        _ = messageID
    }

    func setTyping(chatID: UUID, isTyping: Bool) async throws {
        _ = chatID
        _ = isTyping
    }

    func requestUploadURL(mimeType: String, sizeBytes: Int, width: Int?, height: Int?) async throws -> MediaUploadTarget {
        _ = mimeType
        _ = sizeBytes
        _ = width
        _ = height
        throw AppError.unknown
    }

    func uploadImage(to uploadURL: URL, data: Data, mimeType: String) async throws -> String? {
        _ = uploadURL
        _ = data
        _ = mimeType
        return nil
    }

    func confirmUpload(mediaID: UUID, etag: String?) async throws {
        _ = mediaID
        _ = etag
    }
}

private struct ContactsServiceStub: ContactsNetworking {
    var contacts: [ContactDTO] = []

    func listContacts() async throws -> [ContactDTO] {
        contacts
    }
}

private struct ReachabilityServiceStub: ReachabilityService {
    let isReachable: Bool

    func observe() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            continuation.yield(isReachable)
        }
    }
}

private struct AnalyticsServiceSpy: AnalyticsService {
    func track(event: AppAnalyticsEvent) {}
    func track(error: Error, context: String) {}
}

private actor AuthServiceSpy: AuthNetworking {
    var lastRequestCodeInput: (method: AuthMethod, contact: String)?
    var lastVerifyCodeInput: (method: AuthMethod, contact: String, code: String)?
    var lastSignInInput: (method: AuthMethod, contact: String, password: String)?

    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse? {
        lastRequestCodeInput = (method, contact)
        return AuthCodeResponse(expiresIn: 300)
    }

    func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        lastVerifyCodeInput = (method, contact, code)
        return AuthVerifyResponse(
            token: "test-token",
            userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            displayName: "Анна Demo"
        )
    }

    func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse {
        lastSignInInput = (method, contact, password)
        return AuthVerifyResponse(
            token: "test-token",
            userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            displayName: "Анна Demo"
        )
    }
}

private final class InMemoryTokenStore: TokenStore {
    private var token: String?

    func store(token: String) {
        self.token = token
    }

    func retrieveToken() -> String? {
        token
    }

    func clear() {
        token = nil
    }
}

private extension ISO8601DateFormatter {
    static let basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
