@testable import MobileMessengerIOS
import XCTest

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

    func testRemoteCacheUpdatesArePersistedAfterDebounce() async throws {
        let storageURL = temporaryStoreURL()
        let store = SwiftDataChatStore(storageURL: storageURL)
        let chat = Chat(
            id: UUID(),
            title: "Отложенный кэш",
            lastMessagePreview: "Сообщение",
            lastActivity: Date(),
            unreadCount: 1
        )

        try await store.upsert(chats: [chat])
        try await Task.sleep(nanoseconds: 400_000_000)

        let restoredStore = SwiftDataChatStore(storageURL: storageURL)
        let restoredChats = try await restoredStore.fetchChats(searchQuery: nil)
        XCTAssertEqual(restoredChats.count, 1)
        XCTAssertEqual(restoredChats.first?.id, chat.id)
        XCTAssertEqual(restoredChats.first?.title, chat.title)
        XCTAssertEqual(restoredChats.first?.unreadCount, chat.unreadCount)
    }

    func testPendingOutgoingMessageIsPersistedImmediately() async throws {
        let storageURL = temporaryStoreURL()
        let store = SwiftDataChatStore(storageURL: storageURL)
        let chatID = UUID()
        let pending = Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: UUID(),
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: .text,
            text: "Офлайн",
            createdAt: Date(),
            status: .sending
        )

        try await store.append(message: pending, for: chatID)

        let restoredStore = SwiftDataChatStore(storageURL: storageURL)
        let restoredMessages = try await restoredStore.loadMessages(
            for: chatID,
            limit: 10,
            before: nil
        )
        XCTAssertEqual(restoredMessages.count, 1)
        XCTAssertEqual(restoredMessages.first?.id, pending.id)
        XCTAssertEqual(restoredMessages.first?.localID, pending.localID)
        XCTAssertEqual(restoredMessages.first?.status, .sending)
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
        SessionStore.Constants.currentUserID = try XCTUnwrap(UUID(uuidString: "11111111-2222-3333-4444-555555555555"))
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
                ),
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

    func testSessionLogoutClearsTokenAndUserIdentity() throws {
        let tokenStore = InMemoryTokenStore()
        let defaults = try XCTUnwrap(UserDefaults(suiteName: UUID().uuidString))
        let sessionStore = SessionStore(tokenStore: tokenStore, defaults: defaults)
        let userID = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))

        sessionStore.authenticate(with: "demo-token", userID: userID, displayName: "Анна Demo")
        sessionStore.logout()

        XCTAssertNil(tokenStore.retrieveToken())
        XCTAssertNil(sessionStore.authToken)
        XCTAssertNil(sessionStore.currentUserID)
        XCTAssertEqual(sessionStore.state, .unauthenticated)
    }

    func testUserSwitchClearsOldChatsBeforeLoadingNextAccount() async throws {
        let tokenStore = InMemoryTokenStore()
        let defaults = try XCTUnwrap(UserDefaults(suiteName: UUID().uuidString))
        let sessionStore = SessionStore(tokenStore: tokenStore, defaults: defaults)
        let store = SwiftDataChatStore(storageURL: temporaryStoreURL())
        let chatID = UUID()
        let userA = try XCTUnwrap(UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))
        let userB = try XCTUnwrap(UUID(uuidString: "BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF"))

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
        for _ in 0 ..< 20 {
            let messages = try await store.loadMessages(for: chatID, limit: 10, before: nil)
            if let first = messages.first, first.status == .failed {
                return messages
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return try await store.loadMessages(for: chatID, limit: 10, before: nil)
    }
}
