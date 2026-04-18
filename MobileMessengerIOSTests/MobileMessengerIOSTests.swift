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
