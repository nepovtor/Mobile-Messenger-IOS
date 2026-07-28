@testable import MobileMessengerIOS
import XCTest

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
            editMessage: EditMessageUseCase(repository: repository),
            deleteMessage: DeleteMessageUseCase(repository: repository),
            setTyping: SetTypingUseCase(repository: repository),
            retryPending: RetryPendingMessagesUseCase(repository: repository),
            markStatus: MarkMessageStatusUseCase(repository: repository),
            analytics: AnalyticsServiceSpy(),
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

    func testMarkAsReadDeduplicatesRepeatedAppearanceOfLastMessage() async {
        let repository = ChatRepositorySpy()
        let message = makeOutgoingMessage(status: .delivered, text: "Прочитано")
        let markExpectation = expectation(description: "message marked as read")
        repository.onMarkMessage = { _ in markExpectation.fulfill() }
        let viewModel = ChatViewModel(
            chatID: message.id.chatID,
            title: "Read Chat",
            observeMessages: ObserveChatMessagesUseCase(repository: repository),
            loadHistory: LoadChatHistoryUseCase(repository: repository),
            sendMessage: SendMessageUseCase(repository: repository),
            sendImageMessage: SendImageMessageUseCase(repository: repository),
            editMessage: EditMessageUseCase(repository: repository),
            deleteMessage: DeleteMessageUseCase(repository: repository),
            setTyping: SetTypingUseCase(repository: repository),
            retryPending: RetryPendingMessagesUseCase(repository: repository),
            markStatus: MarkMessageStatusUseCase(repository: repository),
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true)
        )

        viewModel.markAsRead(messageID: message.id.messageID)
        viewModel.markAsRead(messageID: message.id.messageID)
        await fulfillment(of: [markExpectation], timeout: 1.0)

        XCTAssertEqual(repository.markedMessageIDs, [message.id.messageID])
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
