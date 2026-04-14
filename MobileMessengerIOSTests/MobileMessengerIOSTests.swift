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
}

private final class ChatRepositorySpy: ChatRepository {
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
    var observedMessages: AsyncStream<Message> = AsyncStream { continuation in
        continuation.finish()
    }
    var onSendMessage: ((UUID, String, UUID?) -> Void)?

    func createChat(title: String, participantContacts: [String]) async throws -> Chat {
        createChatResult
    }

    func listChats(searchQuery: String?) async throws -> [Chat] {
        listChatsResult
    }

    func observeMessages(for chatID: UUID) -> AsyncStream<Message> {
        observedMessages
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
