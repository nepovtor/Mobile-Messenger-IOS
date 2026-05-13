import Foundation

@MainActor
final class ContactsViewModel: ObservableObject {
    @Published private(set) var contacts: [Contact] = [] {
        didSet { updateFilteredContacts() }
    }
    @Published private(set) var filteredContacts: [Contact] = []
    @Published var searchQuery = "" {
        didSet { updateFilteredContacts() }
    }
    @Published var addPhone = ""
    @Published private(set) var isLoading = false
    @Published private(set) var isAdding = false
    @Published private(set) var removingContactID: UUID?
    @Published private(set) var errorMessage: String?
    @Published private(set) var successMessage: String?
    @Published private(set) var openingContactID: UUID?

    private let loadContacts: LoadContactsUseCase
    private let addContactUseCase: AddContactUseCase
    private let removeContactUseCase: RemoveContactUseCase
    private let loadChats: LoadChatListUseCase
    private let createChatUseCase: CreateChatUseCase
    private let analytics: AnalyticsService
    private var hasLoaded = false
    private var currentUserID: UUID?

    init(
        loadContacts: LoadContactsUseCase,
        addContact: AddContactUseCase,
        removeContact: RemoveContactUseCase,
        loadChats: LoadChatListUseCase,
        createChat: CreateChatUseCase,
        analytics: AnalyticsService
    ) {
        self.loadContacts = loadContacts
        self.addContactUseCase = addContact
        self.removeContactUseCase = removeContact
        self.loadChats = loadChats
        self.createChatUseCase = createChat
        self.analytics = analytics
    }

    private func updateFilteredContacts() {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else {
            filteredContacts = contacts
            return
        }

        filteredContacts = contacts.filter { contact in
            contact.displayName.lowercased().contains(query) ||
            contact.phone.lowercased().contains(query)
        }
    }

    var addContactValidationMessage: String? {
        Self.phoneValidationMessage(for: addPhone)
    }

    func handleSessionChange(_ sessionState: SessionStore.State) {
        switch sessionState {
        case let .authenticated(_, userID, _):
            if currentUserID != userID {
                resetState()
                currentUserID = userID
            }
        case .unauthenticated:
            currentUserID = nil
            resetState()
        }
    }

    func onAppear() {
        guard !hasLoaded else { return }
        hasLoaded = true
        Task { await refresh() }
    }

    func refresh() async {
        guard currentUserID != nil else { return }
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            contacts = try await loadContacts()
            errorMessage = nil
            successMessage = nil
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_load")
        }
    }

    func addContact() async {
        let trimmedPhone = addPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        if let validationMessage = Self.phoneValidationMessage(for: trimmedPhone) {
            successMessage = nil
            errorMessage = validationMessage
            return
        }
        guard !isAdding else { return }

        isAdding = true
        defer { isAdding = false }

        do {
            let contact = try await addContactUseCase(phone: trimmedPhone)
            contacts.removeAll { $0.id == contact.id }
            contacts.insert(contact, at: 0)
            addPhone = ""
            errorMessage = nil
            successMessage = contact.alreadyExists == true ? "Контакт уже добавлен." : "Контакт добавлен."
        } catch {
            successMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_add")
        }
    }

    func removeContact(_ contact: Contact) async {
        guard removingContactID == nil else { return }
        removingContactID = contact.id
        defer { removingContactID = nil }

        do {
            try await removeContactUseCase(id: contact.id)
            contacts.removeAll { $0.id == contact.id }
            errorMessage = nil
            successMessage = "Контакт удалён."
        } catch {
            successMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_remove")
        }
    }

    func openChat(with contact: Contact) async -> ChatListItem? {
        guard openingContactID == nil else { return nil }

        openingContactID = contact.userID
        defer { openingContactID = nil }

        do {
            if let directChatID = contact.directChatID,
               let directChat = try await findChat(id: directChatID) {
                errorMessage = nil
                return Self.mapChat(directChat)
            }

            let chat = try await createChatUseCase(
                title: contact.displayName,
                participantContacts: [contact.phone]
            )
            errorMessage = nil
            return Self.mapChat(chat)
        } catch {
            successMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_open_chat")
            return nil
        }
    }

    static func phoneValidationMessage(for rawPhone: String) -> String? {
        let trimmed = rawPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "Введите номер телефона."
        }
        if !trimmed.hasPrefix("+") {
            return "Номер должен начинаться с +."
        }
        if trimmed.count < 8 {
            return "Введите корректный номер телефона."
        }
        return nil
    }

    private func resetState() {
        contacts = []
        searchQuery = ""
        addPhone = ""
        isLoading = false
        isAdding = false
        removingContactID = nil
        errorMessage = nil
        successMessage = nil
        openingContactID = nil
        hasLoaded = false
    }

    private func findChat(id: UUID) async throws -> Chat? {
        let cachedChats = await loadChats.cached(searchQuery: nil)
        if let cached = cachedChats.first(where: { $0.id == id }) {
            return cached
        }

        let remoteChats = try await loadChats(searchQuery: nil)
        return remoteChats.first(where: { $0.id == id })
    }

    private static func mapChat(_ chat: Chat) -> ChatListItem {
        ChatListItem(
            id: chat.id,
            title: chat.title,
            lastMessagePreview: chat.lastMessagePreview,
            updatedAt: chat.lastActivity,
            unreadCount: chat.unreadCount,
            typingParticipants: chat.typingParticipants,
            participantNames: chat.participantNames,
            participantCount: chat.participantCount
        )
    }
}
