import Foundation

struct ChatListItem: Identifiable, Hashable {
    let id: UUID
    let title: String
    let lastMessagePreview: String?
    let updatedAt: Date
    let unreadCount: Int
    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
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
        Self.relativeFormatter.localizedString(for: updatedAt, relativeTo: Date())
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: ChatListItem, rhs: ChatListItem) -> Bool {
        lhs.id == rhs.id
    }
}

@MainActor
final class ChatListViewModel: ObservableObject {
    @Published private(set) var chats: [ChatListItem] = []
    @Published var searchQuery: String = ""

    var filteredChats: [ChatListItem] {
        guard !searchQuery.isEmpty else { return chats }
        let lowered = searchQuery.lowercased()
        return chats.filter { chat in
            chat.title.lowercased().contains(lowered) ||
            (chat.lastMessagePreview?.lowercased().contains(lowered) ?? false)
        }
    }

    private let chatCache: ChatCache
    private let analytics: AnalyticsService
    private var didLoad = false

    init(chatCache: ChatCache = SwiftDataChatCache.shared, analytics: AnalyticsService = DefaultAnalyticsService.shared) {
        self.chatCache = chatCache
        self.analytics = analytics
    }

    func prepare() async {
        guard !didLoad else { return }
        didLoad = true
        ensureSeedDataIfNeeded()
        loadChats()
    }

    func refresh() async {
        loadChats()
    }

    @discardableResult
    func createSampleChat() -> ChatListItem? {
        let chatID = UUID()
        let title = "Новый чат \(chats.count + 1)"
        let message = ChatMessage(text: "Привет! Это начало новой переписки.", isOutgoing: false, status: .delivered)

        chatCache.ensureChatExists(id: chatID, title: title)
        do {
            try chatCache.saveMessage(message, in: chatID)
            loadChats()
            return chats.first(where: { $0.id == chatID })
        } catch {
            analytics.trackStorageError(error)
            return nil
        }
    }

    private func loadChats() {
        do {
            let cached = try chatCache.loadChats()
            chats = cached.map { chat in
                let unread = chat.messages.filter { message in
                    !message.isOutgoing && ChatMessage.DeliveryStatus(rawValue: message.statusRaw) != .read
                }.count

                return ChatListItem(
                    id: chat.id,
                    title: chat.title,
                    lastMessagePreview: chat.lastMessagePreview,
                    updatedAt: chat.updatedAt,
                    unreadCount: unread
                )
            }
        } catch {
            analytics.trackStorageError(error)
        }
    }

    private func ensureSeedDataIfNeeded() {
        do {
            if try chatCache.loadChats().isEmpty {
                seedInitialChats()
            }
        } catch {
            analytics.trackStorageError(error)
        }
    }

    private func seedInitialChats() {
        let seeds: [(UUID, String, String, TimeInterval)] = [
            (UUID(), "Команда разработки", "Не забудьте подготовить демо к пятнице.", -3600),
            (UUID(), "Алексей Смирнов", "Спасибо за документы!", -7200),
            (UUID(), "Семейный чат", "У кого есть идеи для выходных?", -9600)
        ]

        for (id, title, preview, offset) in seeds {
            chatCache.ensureChatExists(id: id, title: title)
            let message = ChatMessage(
                text: preview,
                isOutgoing: false,
                status: .delivered,
                timestamp: Date().addingTimeInterval(offset)
            )
            do {
                try chatCache.saveMessage(message, in: id)
            } catch {
                analytics.trackStorageError(error)
            }
        }

        loadChats()
    }
}
