@testable import MobileMessengerIOS
import XCTest

@MainActor
final class ContactsViewModelTests: XCTestCase {
    func testAddContactSuccessUpdatesList() async {
        let contactsService = ContactsServiceStub()
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        let newContact = makeContact(displayName: "Борис Demo", phone: "+15551230012")
        contactsService.addContactResult = .success(newContact)

        let viewModel = ContactsViewModel(
            loadContacts: LoadContactsUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            addContact: AddContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            removeContact: RemoveContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            loadChats: LoadChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            analytics: analytics
        )
        viewModel.handleSessionChange(
            .authenticated(token: "token", userID: UUID(), displayName: "Анна Demo")
        )
        viewModel.addPhone = "+15551230012"

        await viewModel.addContact()

        XCTAssertEqual(viewModel.contacts.first?.displayName, "Борис Demo")
        XCTAssertEqual(viewModel.successMessage, "Контакт добавлен.")
        XCTAssertNil(viewModel.errorMessage)
    }

    func testAddContactMapsDuplicateAndUserNotFoundErrors() async {
        let contactsService = ContactsServiceStub()
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()

        contactsService.addContactResult = .success(
            makeContact(displayName: "Борис Demo", phone: "+15551230012", alreadyExists: true)
        )
        let duplicateViewModel = ContactsViewModel(
            loadContacts: LoadContactsUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            addContact: AddContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            removeContact: RemoveContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            loadChats: LoadChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            analytics: analytics
        )
        duplicateViewModel.handleSessionChange(
            .authenticated(token: "token", userID: UUID(), displayName: "Анна Demo")
        )
        duplicateViewModel.addPhone = "+15551230012"
        await duplicateViewModel.addContact()
        XCTAssertEqual(duplicateViewModel.successMessage, "Контакт уже добавлен.")

        contactsService.addContactResult = .failure(
            APIResponseParser.ParseError(
                userMessage: "User with this phone number was not found",
                backendCode: "USER_NOT_FOUND"
            )
        )
        let missingUserViewModel = ContactsViewModel(
            loadContacts: LoadContactsUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            addContact: AddContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            removeContact: RemoveContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            loadChats: LoadChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            analytics: analytics
        )
        missingUserViewModel.handleSessionChange(
            .authenticated(token: "token", userID: UUID(), displayName: "Анна Demo")
        )
        missingUserViewModel.addPhone = "+15559999999"
        await missingUserViewModel.addContact()
        XCTAssertEqual(missingUserViewModel.errorMessage, "Пользователь с таким номером не найден.")
    }

    func testAddContactMapsCannotAddSelfError() async {
        let contactsService = ContactsServiceStub()
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        contactsService.addContactResult = .failure(
            APIResponseParser.ParseError(
                userMessage: "You cannot add yourself to contacts",
                backendCode: "CANNOT_ADD_SELF"
            )
        )

        let viewModel = ContactsViewModel(
            loadContacts: LoadContactsUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            addContact: AddContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            removeContact: RemoveContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            loadChats: LoadChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            analytics: analytics
        )
        viewModel.handleSessionChange(
            .authenticated(token: "token", userID: UUID(), displayName: "Анна Demo")
        )
        viewModel.addPhone = "+15551230011"

        await viewModel.addContact()

        XCTAssertEqual(viewModel.errorMessage, "Нельзя добавить самого себя.")
    }

    func testContactsStateClearsOnLogoutAndUserSwitch() async {
        let contactsService = ContactsServiceStub()
        let repository = ChatRepositorySpy()
        let analytics = AnalyticsServiceSpy()
        contactsService.contacts = [makeContact(displayName: "Борис Demo", phone: "+15551230012")]

        let viewModel = ContactsViewModel(
            loadContacts: LoadContactsUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            addContact: AddContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            removeContact: RemoveContactUseCase(
                repository: DefaultContactsRepository(service: contactsService)
            ),
            loadChats: LoadChatListUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: repository),
            analytics: analytics
        )

        let userA = UUID()
        let userB = UUID()
        viewModel.handleSessionChange(.authenticated(token: "token-a", userID: userA, displayName: "Анна"))
        await viewModel.refresh()
        XCTAssertEqual(viewModel.contacts.count, 1)

        viewModel.handleSessionChange(.unauthenticated)
        XCTAssertTrue(viewModel.contacts.isEmpty)

        contactsService.contacts = [makeContact(displayName: "Вера Demo", phone: "+15551230013")]
        viewModel.handleSessionChange(.authenticated(token: "token-b", userID: userB, displayName: "Борис"))
        await viewModel.refresh()
        XCTAssertEqual(viewModel.contacts.map(\.displayName), ["Вера Demo"])
    }

    private func makeContact(
        displayName: String,
        phone: String,
        alreadyExists: Bool? = nil
    ) -> ContactDTO {
        ContactDTO(
            id: UUID(),
            userID: UUID(),
            displayName: displayName,
            phone: phone,
            createdAt: "2026-05-01T00:00:00.000Z",
            directChatID: nil,
            alreadyExists: alreadyExists
        )
    }
}

