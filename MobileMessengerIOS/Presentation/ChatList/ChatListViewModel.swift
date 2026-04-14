import Foundation

public struct ChatListItem: Identifiable, Hashable {
    public let id: UUID
    public let title: String
    public let lastMessagePreview: String?
    public let updatedAt: Date
    public let unreadCount: Int
    public let typingParticipants: [String]
    public let participantNames: [String]
    public let participantCount: Int

    private static let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter
    }()

    public var initials: String {
        let words = title.split(separator: " ")
        if let first = words.first, let last = words.dropFirst().first {
            return String(first.prefix(1)) + String(last.prefix(1))
        }
        return title.isEmpty ? "" : String(title.prefix(2))
    }

    public var relativeDateString: String {
        Self.formatter.localizedString(for: updatedAt, relativeTo: Date())
    }

    public var isGroup: Bool {
        participantCount > 2
    }

    public var participantsSummary: String? {
        guard isGroup else { return nil }
        let visibleNames = participantNames.prefix(3)
        guard !visibleNames.isEmpty else {
            return "\(participantCount) участников"
        }

        let extraCount = max(0, participantNames.count - visibleNames.count)
        let suffix = extraCount > 0 ? " +\(extraCount)" : ""
        return visibleNames.joined(separator: ", ") + suffix
    }

    public init(
        id: UUID,
        title: String,
        lastMessagePreview: String?,
        updatedAt: Date,
        unreadCount: Int,
        typingParticipants: [String],
        participantNames: [String],
        participantCount: Int
    ) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.updatedAt = updatedAt
        self.unreadCount = unreadCount
        self.typingParticipants = typingParticipants
        self.participantNames = participantNames
        self.participantCount = participantCount
    }
}

@MainActor
public final class ChatListViewModel: ObservableObject {
    @Published public private(set) var chats: [ChatListItem] = []
    @Published public private(set) var availableContacts: [ContactDTO] = []
    @Published public var searchQuery: String = "" {
        didSet { scheduleSearch() }
    }
    @Published public var isLoading = false
    @Published public var isShowingError = false
    @Published public private(set) var isCreatingChat = false
    @Published public private(set) var isLoadingCreateContacts = false
    @Published public private(set) var createContactsError: String?

    private let loadChats: LoadChatListUseCase
    private let createChatUseCase: CreateChatUseCase
    private let contactsService: ContactsNetworking
    private let analytics: AnalyticsService
    private var searchTask: Task<Void, Never>?
    private var hasLoadedCreateContacts = false

    public init(
        loadChats: LoadChatListUseCase,
        createChat: CreateChatUseCase,
        contactsService: ContactsNetworking,
        analytics: AnalyticsService
    ) {
        self.loadChats = loadChats
        self.createChatUseCase = createChat
        self.contactsService = contactsService
        self.analytics = analytics
    }

    public func onAppear() {
        Task { await refresh() }
    }

    public func refresh() async {
        isLoading = true
        do {
            let chats = try await loadChats(searchQuery: searchQuery.isEmpty ? nil : searchQuery)
            self.chats = chats.map(Self.mapChat)
            isShowingError = false
        } catch {
            isShowingError = true
            analytics.track(error: error, context: "chat_list_load")
        }
        isLoading = false
    }

    @discardableResult
    public func createChat(title: String, participantContacts: [String]) async -> ChatListItem? {
        guard !isCreatingChat else { return nil }
        isCreatingChat = true
        defer { isCreatingChat = false }

        do {
            let chat = try await createChatUseCase(title: title, participantContacts: participantContacts)
            let item = Self.mapChat(chat)
            chats.removeAll { $0.id == item.id }
            chats.insert(item, at: 0)
            return item
        } catch {
            isShowingError = true
            analytics.track(error: error, context: "chat_create")
            return nil
        }
    }

    public func loadCreateContactsIfNeeded(force: Bool = false) async {
        guard force || !hasLoadedCreateContacts else { return }
        guard !isLoadingCreateContacts else { return }

        isLoadingCreateContacts = true
        defer { isLoadingCreateContacts = false }

        do {
            let contacts = try await contactsService.listContacts()
                .filter { !$0.isCurrentUser }
                .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
            availableContacts = contacts
            createContactsError = nil
            hasLoadedCreateContacts = true
        } catch {
            createContactsError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            analytics.track(error: error, context: "group_contacts_load")
        }
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
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
