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

    func testRealtimeMessageIsAddedWithoutReloadingHistory() async {
        let chatID = UUID()
        let repository = ChatRepositorySpy()
        let (stream, continuation) = AsyncStream<Message>.makeStream()
        repository.observedMessages = stream
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { observedChatID in
            XCTAssertEqual(observedChatID, chatID)
            subscribed.fulfill()
        }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        let message = makeMessage(chatID: chatID, text: "Realtime")
        continuation.yield(message)

        let didReceiveMessage = await waitUntil { viewModel.messages.count == 1 }
        XCTAssertTrue(didReceiveMessage)
        XCTAssertEqual(viewModel.messages.first?.id, message.id)
        XCTAssertEqual(repository.historyLoadCount, 1)
        viewModel.onDisappear()
        continuation.finish()
    }

    func testDuplicateStableMessageIDDoesNotCreateDuplicate() async {
        let chatID = UUID()
        let serverID = UUID()
        let localID = UUID()
        let repository = ChatRepositorySpy()
        let (stream, continuation) = AsyncStream<Message>.makeStream()
        repository.observedMessages = stream
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { _ in subscribed.fulfill() }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        continuation.yield(
            makeMessage(
                chatID: chatID,
                messageID: serverID,
                localID: localID,
                text: "First"
            )
        )
        continuation.yield(
            makeMessage(
                chatID: chatID,
                messageID: serverID,
                localID: localID,
                text: "Latest"
            )
        )

        let didUpsertLatestMessage = await waitUntil { viewModel.messages.first?.text == "Latest" }
        XCTAssertTrue(didUpsertLatestMessage)
        XCTAssertEqual(viewModel.messages.count, 1)
        viewModel.onDisappear()
        continuation.finish()
    }

    func testMessageFromAnotherChatIsIgnored() async {
        let chatID = UUID()
        let repository = ChatRepositorySpy()
        let (stream, continuation) = AsyncStream<Message>.makeStream()
        repository.observedMessages = stream
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { _ in subscribed.fulfill() }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        continuation.yield(makeMessage(chatID: UUID(), text: "Wrong chat"))
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(viewModel.messages.isEmpty)
        viewModel.onDisappear()
        continuation.finish()
    }

    func testRealtimeEditAndDeleteUpdateExistingMessage() async {
        let chatID = UUID()
        let serverID = UUID()
        let localID = UUID()
        let original = makeMessage(
            chatID: chatID,
            messageID: serverID,
            localID: localID,
            text: "Original"
        )
        let repository = ChatRepositorySpy()
        repository.historyResult = [original]
        let (stream, continuation) = AsyncStream<Message>.makeStream()
        repository.observedMessages = stream
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { _ in subscribed.fulfill() }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        let editedAt = Date()
        continuation.yield(
            makeMessage(
                chatID: chatID,
                messageID: serverID,
                localID: localID,
                text: "Edited",
                editedAt: editedAt
            )
        )
        let didApplyEdit = await waitUntil { viewModel.messages.first?.text == "Edited" }
        XCTAssertTrue(didApplyEdit)
        XCTAssertEqual(viewModel.messages.first?.editedAt, editedAt)

        let deletedAt = editedAt.addingTimeInterval(1)
        continuation.yield(
            makeMessage(
                chatID: chatID,
                messageID: serverID,
                localID: localID,
                text: "",
                editedAt: editedAt,
                deletedAt: deletedAt
            )
        )
        let didApplyDelete = await waitUntil { viewModel.messages.first?.deletedAt == deletedAt }
        XCTAssertTrue(didApplyDelete)
        XCTAssertEqual(viewModel.messages.count, 1)
        viewModel.onDisappear()
        continuation.finish()
    }

    func testOptimisticMessageIsReconciledWithServerIDAndMultilineInputClears() async {
        let chatID = UUID()
        let serverID = UUID()
        let repository = ChatRepositorySpy()
        let (stream, continuation) = AsyncStream<Message>.makeStream()
        repository.observedMessages = stream
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { _ in subscribed.fulfill() }
        let sendInvoked = expectation(description: "send invoked")
        repository.onSendMessage = { _, _, _ in sendInvoked.fulfill() }
        repository.sendMessageHandler = { chatID, text, localID in
            let localID = localID ?? UUID()
            return self.makeMessage(
                chatID: chatID,
                messageID: localID,
                localID: localID,
                authorID: SessionStore.Constants.currentUserID,
                text: text,
                status: .sending
            )
        }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        viewModel.inputText = "line1\nline2"
        viewModel.sendMessage()
        await fulfillment(of: [sendInvoked], timeout: 1.0)
        let didAddOptimisticMessage = await waitUntil { viewModel.messages.first?.status == .sending }
        XCTAssertTrue(didAddOptimisticMessage)
        let localID = viewModel.messages[0].localID
        XCTAssertEqual(viewModel.inputText, "")

        continuation.yield(
            makeMessage(
                chatID: chatID,
                messageID: serverID,
                localID: localID,
                authorID: SessionStore.Constants.currentUserID,
                text: "line1\nline2",
                status: .sent
            )
        )

        let didReconcileServerID = await waitUntil { viewModel.messages.first?.id.messageID == serverID }
        XCTAssertTrue(didReconcileServerID)
        XCTAssertEqual(viewModel.messages.count, 1)
        XCTAssertEqual(viewModel.messages.first?.localID, localID)
        viewModel.onDisappear()
        continuation.finish()
    }

    func testOnAppearSubscribesOnceAndOnDisappearCancelsStream() async {
        let chatID = UUID()
        let repository = ChatRepositorySpy()
        let terminated = expectation(description: "chat message stream terminated")
        repository.observedMessages = AsyncStream { continuation in
            continuation.onTermination = { _ in terminated.fulfill() }
        }
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { _ in subscribed.fulfill() }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        XCTAssertEqual(repository.observedMessageChatIDs, [chatID])

        viewModel.onDisappear()
        await fulfillment(of: [terminated], timeout: 1.0)
    }

    func testLoadOlderMessagesUsesOldestStableIDAndMergesPage() async {
        let chatID = UUID()
        let start = Date(timeIntervalSince1970: 10_000)
        let initial = (0 ..< 100).map { offset in
            makeMessage(
                chatID: chatID,
                text: "Message \(offset)",
                createdAt: start.addingTimeInterval(TimeInterval(offset))
            )
        }
        let older = makeMessage(
            chatID: chatID,
            text: "Older",
            createdAt: start.addingTimeInterval(-1)
        )
        let repository = ChatRepositorySpy()
        repository.historyResult = initial
        repository.loadHistoryHandler = { _, _, before in
            before == nil ? initial : [older]
        }
        let (stream, continuation) = AsyncStream<Message>.makeStream()
        repository.observedMessages = stream
        let subscribed = expectation(description: "chat message stream subscribed")
        repository.onObserveMessages = { _ in subscribed.fulfill() }
        let viewModel = makeViewModel(chatID: chatID, repository: repository)

        viewModel.onAppear()
        await fulfillment(of: [subscribed], timeout: 1.0)
        XCTAssertTrue(viewModel.hasMoreHistory)
        let oldestID = try? XCTUnwrap(viewModel.messages.first?.id.messageID)

        viewModel.loadOlderMessages()
        let didLoadOlderPage = await waitUntil { repository.historyLoadCount == 2 }
        let didMergeOlderPage = await waitUntil { viewModel.messages.first?.id == older.id }
        XCTAssertTrue(didLoadOlderPage)
        XCTAssertTrue(didMergeOlderPage)
        XCTAssertEqual(repository.historyRequests.last?.before, oldestID)
        XCTAssertFalse(viewModel.hasMoreHistory)
        viewModel.onDisappear()
        continuation.finish()
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

    private func makeViewModel(
        chatID: UUID,
        repository: ChatRepositorySpy,
        reachability: ReachabilityService = ReachabilityServiceStub(isReachable: true)
    ) -> ChatViewModel {
        ChatViewModel(
            chatID: chatID,
            title: "Test Chat",
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
    }

    private func makeMessage(
        chatID: UUID,
        messageID: UUID = UUID(),
        localID: UUID? = nil,
        authorID: UUID = UUID(),
        text: String,
        createdAt: Date = Date(),
        status: MessageStatus = .delivered,
        editedAt: Date? = nil,
        deletedAt: Date? = nil
    ) -> Message {
        Message(
            id: Message.Identifier(chatID: chatID, messageID: messageID),
            localID: localID ?? messageID,
            authorID: authorID,
            authorName: "Анна",
            kind: .text,
            text: text,
            createdAt: createdAt,
            status: status,
            editedAt: editedAt,
            deletedAt: deletedAt
        )
    }

    private func waitUntil(
        timeout: TimeInterval = 1,
        condition: @MainActor () -> Bool
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        return condition()
    }
}
