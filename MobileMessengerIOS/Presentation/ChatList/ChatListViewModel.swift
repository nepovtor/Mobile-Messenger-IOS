import Foundation

struct ChatListItem: Identifiable, Hashable {
    let id: UUID
    let title: String
    let lastMessagePreview: String?
    let updatedAt: Date
    let unreadCount: Int
    let typingParticipants: [String]

    private static let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter
    }()

    var initials: String {
        let words = title.split(separator: " ")
        if let first = words.first, let last = words.dropFirst().first {
            return String(first.prefix(1)) + String(last.prefix(1))
        }
        return title.isEmpty ? "" : String(title.prefix(2))
    }

    var relativeDateString: String {
        Self.formatter.localizedString(for: updatedAt, relativeTo: Date())
    }
}

@MainActor
final class ChatListViewModel: ObservableObject {
    @Published private(set) var chats: [ChatListItem] = []
    @Published var searchQuery: String = "" {
        didSet { scheduleSearch() }
    }
    @Published var isLoading = false
    @Published var isShowingError = false

    private let loadChats: LoadChatListUseCase
    private let analytics: AnalyticsService
    private var searchTask: Task<Void, Never>?

    init(loadChats: LoadChatListUseCase, analytics: AnalyticsService) {
        self.loadChats = loadChats
        self.analytics = analytics
    }

    func onAppear() {
        Task { await refresh() }
    }

    func refresh() async {
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

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
