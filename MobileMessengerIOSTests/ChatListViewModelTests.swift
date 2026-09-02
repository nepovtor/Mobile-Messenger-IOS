@testable import MobileMessengerIOS
import XCTest

@MainActor
final class ChatListViewModelTests: XCTestCase {
    func testChatListItemCopiesChatDisplayFields() {
        let date = Date(timeIntervalSince1970: 1_234_567_890)
        let chat = Chat(
            id: UUID(),
            title: "Групповой чат",
            lastMessagePreview: "Всем привет",
            lastActivity: date,
            unreadCount: 3,
            typingParticipants: ["Анна"],
            participantNames: ["Анна", "Борис", "Вера"],
            participantCount: 3
        )

        let item = ChatListItem(chat: chat)

        XCTAssertEqual(item.id, chat.id)
        XCTAssertEqual(item.title, chat.title)
        XCTAssertEqual(item.lastMessagePreview, chat.lastMessagePreview)
        XCTAssertEqual(item.updatedAt, chat.lastActivity)
        XCTAssertEqual(item.unreadCount, chat.unreadCount)
        XCTAssertEqual(item.typingParticipants, chat.typingParticipants)
        XCTAssertEqual(item.participantNames, chat.participantNames)
        XCTAssertEqual(item.participantCount, chat.participantCount)
        XCTAssertTrue(item.isGroup)
    }

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
            deleteChat: DeleteChatUseCase(repository: repository),
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

    func testLoadCreateContactsSortsAlphabetically() async {
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        let contactsService = ContactsServiceStub()
        contactsService.contacts = [
            makeContact(displayName: "Глеб Demo"),
            makeContact(displayName: "Анна Demo"),
        ]

        let viewModel = ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: repository),
            observeChats: ObserveChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            deleteChat: DeleteChatUseCase(repository: repository),
            contactsService: contactsService,
            analytics: analytics
        )

        await viewModel.loadCreateContactsIfNeeded()

        XCTAssertEqual(viewModel.availableContacts.map { $0.displayName }, ["Анна Demo", "Глеб Demo"])
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
            ),
        ]

        let viewModel = ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: repository),
            observeChats: ObserveChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            deleteChat: DeleteChatUseCase(repository: repository),
            contactsService: contactsService,
            analytics: analytics
        )

        await viewModel.refresh()
        viewModel.searchQuery = "борис"

        XCTAssertEqual(viewModel.chats.count, 1)
        XCTAssertEqual(viewModel.chats.first?.title, "Борис Demo")
    }

    func testDeleteChatRemovesItFromVisibleList() async {
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        let contactsService = ContactsServiceStub()
        let now = Date()
        let deletedChat = Chat(
            id: UUID(),
            title: "Удаляемый чат",
            lastMessagePreview: "Пока",
            lastActivity: now,
            unreadCount: 0,
            participantNames: ["Борис Demo"],
            participantCount: 2
        )
        let remainingChat = Chat(
            id: UUID(),
            title: "Оставшийся чат",
            lastMessagePreview: "Привет",
            lastActivity: now.addingTimeInterval(-60),
            unreadCount: 0,
            participantNames: ["Анна Demo"],
            participantCount: 2
        )
        repository.listChatsResult = [deletedChat, remainingChat]

        let viewModel = ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: repository),
            observeChats: ObserveChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            deleteChat: DeleteChatUseCase(repository: repository),
            contactsService: contactsService,
            analytics: analytics
        )

        await viewModel.refresh()
        XCTAssertEqual(viewModel.chats.map(\.id), [deletedChat.id, remainingChat.id])

        let wasDeleted = await viewModel.deleteChat(viewModel.chats[0])

        XCTAssertTrue(wasDeleted)
        XCTAssertEqual(repository.deletedChatIDs, [deletedChat.id])
        XCTAssertEqual(viewModel.chats.map(\.id), [remainingChat.id])
    }

    private func makeContact(displayName: String) -> ContactDTO {
        ContactDTO(
            id: UUID(),
            userID: UUID(),
            displayName: displayName,
            phone: "+15550000000",
            createdAt: "2026-05-01T00:00:00.000Z",
            directChatID: nil,
            alreadyExists: nil
        )
    }
}
