import Foundation

struct ChatListItem: Identifiable, Hashable {
    let id: UUID
    let title: String
    let lastMessagePreview: String?
    let updatedAt: Date
    let unreadCount: Int
    let typingParticipants: [String]

    private static let englishFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.unitsStyle = .full
        return formatter
    }()

    private static let russianFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
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
        let formatter = AppLanguagePreference.current.isRussian ? Self.russianFormatter : Self.englishFormatter
        return formatter.localizedString(for: updatedAt, relativeTo: Date())
    }
}

@MainActor
public final class ChatListViewModel: ObservableObject {
    @Published private(set) var chats: [ChatListItem] = []
    @Published var searchQuery: String = "" {
        didSet {
            guard !suppressScheduledSearch else { return }
            scheduleSearch()
        }
    }
    @Published var isLoading = false
    @Published var isShowingError = false
    @Published var isCreatingChat = false
    @Published var createChatErrorMessage: String?

    private let loadChats: LoadChatListUseCase
    private let createChatUseCase: CreateChatUseCase
    private let analytics: AnalyticsService
    private var searchTask: Task<Void, Never>?
    private var refreshLoopTask: Task<Void, Never>?
    private var isRefreshing = false
    private var suppressScheduledSearch = false

    init(loadChats: LoadChatListUseCase, createChat: CreateChatUseCase, analytics: AnalyticsService) {
        self.loadChats = loadChats
        self.createChatUseCase = createChat
        self.analytics = analytics
    }

    func onAppear() {
        guard refreshLoopTask == nil else { return }
        Task { await refresh() }
        refreshLoopTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { return }
                guard let self, self.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
                await self.refresh()
            }
        }
    }

    func onDisappear() {
        searchTask?.cancel()
        searchTask = nil
        refreshLoopTask?.cancel()
        refreshLoopTask = nil
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        let shouldShowLoader = chats.isEmpty
        if shouldShowLoader {
            isLoading = true
        }
        defer {
            isRefreshing = false
            if shouldShowLoader {
                isLoading = false
            }
        }

        do {
            let normalizedSearchQuery = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            let chats = try await loadChats(searchQuery: normalizedSearchQuery.isEmpty ? nil : normalizedSearchQuery)
            var chatItems = chats.map(makeChatItem(from:))

            // Добавляем ИИ чат в начало списка
            let aiChat = ChatListItem(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
                title: AppLanguagePreference.localized(ru: "🤖 ИИ Ассистент", en: "🤖 AI Assistant"),
                lastMessagePreview: AppLanguagePreference.localized(ru: "Чем могу помочь?", en: "How can I help?"),
                updatedAt: Date(),
                unreadCount: 0,
                typingParticipants: []
            )
            chatItems.insert(aiChat, at: 0)

            self.chats = chatItems
            isShowingError = false
        } catch {
            isShowingError = true
            analytics.track(error: error, context: "chat_list_load")
        }
    }

    func createChat(title: String) async -> ChatListItem? {
        guard !isCreatingChat else { return nil }
        isCreatingChat = true
        createChatErrorMessage = nil
        defer { isCreatingChat = false }

        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            createChatErrorMessage = AppLanguagePreference.localized(ru: "Название чата не может быть пустым", en: "Chat title cannot be empty")
            return nil
        }

        do {
            let chat = try await createChatUseCase(title: trimmedTitle, participantIDs: [])
            if !searchQuery.isEmpty {
                searchTask?.cancel()
                setSearchQuery("", scheduleRefresh: false)
            }
            await refresh()
            return makeChatItem(from: chat)
        } catch {
            createChatErrorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            analytics.track(error: error, context: "chat_create")
            return nil
        }
    }

    func clearCreateChatState() {
        createChatErrorMessage = nil
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }

    private func setSearchQuery(_ value: String, scheduleRefresh: Bool) {
        suppressScheduledSearch = !scheduleRefresh
        searchQuery = value
        suppressScheduledSearch = false
    }

    private func makeChatItem(from chat: Chat) -> ChatListItem {
        ChatListItem(
            id: chat.id,
            title: chat.title,
            lastMessagePreview: chat.lastMessagePreview,
            updatedAt: chat.lastActivity,
            unreadCount: chat.unreadCount,
            typingParticipants: chat.typingParticipants
        )
    }
}
