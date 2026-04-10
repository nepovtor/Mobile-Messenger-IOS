import Foundation

public struct ChatListItem: Identifiable, Hashable {
    public let id: UUID
    public let title: String
    public let lastMessagePreview: String?
    public let updatedAt: Date
    public let unreadCount: Int
    public let typingParticipants: [String]

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

    public init(
        id: UUID,
        title: String,
        lastMessagePreview: String?,
        updatedAt: Date,
        unreadCount: Int,
        typingParticipants: [String]
    ) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.updatedAt = updatedAt
        self.unreadCount = unreadCount
        self.typingParticipants = typingParticipants
    }
}

@MainActor
public final class ChatListViewModel: ObservableObject {
    @Published public private(set) var chats: [ChatListItem] = []
    @Published public var searchQuery: String = "" {
        didSet { scheduleSearch() }
    }
    @Published public var isLoading = false
    @Published public var isShowingError = false
    @Published public private(set) var isCreatingChat = false

    private let loadChats: LoadChatListUseCase
    private let createChatUseCase: CreateChatUseCase
    private let analytics: AnalyticsService
    private var searchTask: Task<Void, Never>?

    public init(loadChats: LoadChatListUseCase, createChat: CreateChatUseCase, analytics: AnalyticsService) {
        self.loadChats = loadChats
        self.createChatUseCase = createChat
        self.analytics = analytics
    }

    public func onAppear() {
        Task { await refresh() }
    }

    public func refresh() async {
        isLoading = true
        do {
            let chats = try await loadChats(searchQuery: searchQuery.isEmpty ? nil : searchQuery)
            self.chats = chats.map { chat in
                ChatListItem(
                    id: chat.id,
                    title: chat.title,
                    lastMessagePreview: chat.lastMessagePreview,
                    updatedAt: chat.lastActivity,
                    unreadCount: chat.unreadCount,
                    typingParticipants: chat.typingParticipants
                )
            }
            isShowingError = false
        } catch {
            isShowingError = true
            analytics.track(error: error, context: "chat_list_load")
        }
        isLoading = false
    }

    @discardableResult
    public func createChat(title: String, participantContact: String) async -> ChatListItem? {
        guard !isCreatingChat else { return nil }
        isCreatingChat = true
        defer { isCreatingChat = false }

        do {
            let chat = try await createChatUseCase(title: title, participantContact: participantContact)
            let item = ChatListItem(
                id: chat.id,
                title: chat.title,
                lastMessagePreview: chat.lastMessagePreview,
                updatedAt: chat.lastActivity,
                unreadCount: chat.unreadCount,
                typingParticipants: chat.typingParticipants
            )
            chats.insert(item, at: 0)
            return item
        } catch {
            isShowingError = true
            analytics.track(error: error, context: "chat_create")
            return nil
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
}
