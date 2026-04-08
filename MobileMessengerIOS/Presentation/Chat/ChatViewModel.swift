import Foundation

@MainActor
public final class ChatViewModel: ObservableObject {
    enum Banner: Identifiable {
        case error(String)
        case offline

        var id: String {
            switch self {
            case .error(let message):
                return "error_\(message)"
            case .offline:
                return "offline"
            }
        }
    }

    @Published private(set) var title: String
    public let chatID: UUID
    @Published private(set) var messages: [Message] = []
    @Published var inputText: String = "" {
        didSet { scheduleTypingUpdate() }
    }
    @Published var isTyping = false
    @Published private(set) var typingParticipants: [String] = []
    @Published var banner: Banner?
    @Published var isLoadingHistory = true

    private let observeMessages: ObserveChatMessagesUseCase
    private let loadHistory: LoadChatHistoryUseCase
    private let loadChatState: (UUID) async throws -> Chat
    private let sendMessageUseCase: SendMessageUseCase
    private let retryPending: RetryPendingMessagesUseCase
    private let markStatus: MarkMessageStatusUseCase
    private let setTypingState: (UUID, Bool) async -> Void
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager
    private let reachability: ReachabilityService

    private var observeTask: Task<Void, Never>?
    private var stateTask: Task<Void, Never>?
    private var reachabilityTask: Task<Void, Never>?
    private var typingTask: Task<Void, Never>?
    init(
        chatID: UUID,
        title: String,
        observeMessages: ObserveChatMessagesUseCase,
        loadHistory: LoadChatHistoryUseCase,
        loadChatState: @escaping (UUID) async throws -> Chat,
        sendMessage: SendMessageUseCase,
        retryPending: RetryPendingMessagesUseCase,
        markStatus: MarkMessageStatusUseCase,
        setTypingState: @escaping (UUID, Bool) async -> Void,
        analytics: AnalyticsService,
        notificationManager: PushNotificationManager,
        reachability: ReachabilityService
    ) {
        self.chatID = chatID
        self.title = title
        self.observeMessages = observeMessages
        self.loadHistory = loadHistory
        self.loadChatState = loadChatState
        self.sendMessageUseCase = sendMessage
        self.retryPending = retryPending
        self.markStatus = markStatus
        self.setTypingState = setTypingState
        self.analytics = analytics
        self.notificationManager = notificationManager
        self.reachability = reachability
    }

    deinit {
        observeTask?.cancel()
        stateTask?.cancel()
        reachabilityTask?.cancel()
        typingTask?.cancel()
    }

    func onAppear() {
        guard observeTask == nil else { return }
        observeTask = Task { [weak self] in
            await self?.bindMessages()
        }
        stateTask = Task { [weak self] in
            await self?.pollChatState()
        }
        reachabilityTask = Task { [weak self] in
            await self?.bindReachability()
        }
        Task { await loadInitialHistory() }
    }

    func onDisappear() {
        observeTask?.cancel()
        observeTask = nil
        stateTask?.cancel()
        stateTask = nil
        reachabilityTask?.cancel()
        reachabilityTask = nil
        typingTask?.cancel()
        typingTask = nil
        Task { await setTypingState(chatID, false) }
    }

    func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        inputText = ""
        Task { await setTypingState(chatID, false) }

        Task {
            do {
                let message = try await sendMessageUseCase(chatID: chatID, text: trimmed, localID: UUID())
                upsert(message: message)
            } catch {
                banner = .error(AppLanguagePreference.localized(ru: "Не удалось отправить сообщение. Попробуйте снова.", en: "Failed to send the message. Please try again."))
                analytics.track(error: error, context: "send_message")
            }
        }
    }

    func retryFailedMessages() {
        Task { await retryPending(chatID: chatID) }
    }

    func markAsRead(messageID: UUID) {
        Task { try? await markStatus(chatID: chatID, messageID: messageID, status: .read) }
    }

    var typingTitle: String {
        guard let firstParticipant = typingParticipants.first else {
            return AppLanguagePreference.localized(ru: "Собеседник", en: "Contact")
        }
        if typingParticipants.count == 1 {
            return firstParticipant
        }
        return AppLanguagePreference.localized(
            ru: "\(firstParticipant) и еще \(typingParticipants.count - 1)",
            en: "\(firstParticipant) and \(typingParticipants.count - 1) more"
        )
    }

    var presenceLabel: String {
        if !reachability.isReachable {
            return AppLanguagePreference.localized(ru: "Офлайн", en: "Offline")
        }
        if isTyping {
            return AppLanguagePreference.localized(ru: "Печатает", en: "Typing")
        }
        return AppLanguagePreference.localized(ru: "Онлайн", en: "Online")
    }

    var heroStatusValue: String {
        if isLoadingHistory {
            return AppLanguagePreference.localized(ru: "Загрузка", en: "Loading")
        }
        return presenceLabel
    }

    private func loadInitialHistory() async {
        isLoadingHistory = true
        do {
            let history = try await loadHistory(chatID: chatID, limit: 100, before: nil)
            messages = history
            await refreshChatState()
            isLoadingHistory = false
        } catch {
            isLoadingHistory = false
            banner = .error(AppLanguagePreference.localized(ru: "Не удалось загрузить чат", en: "Failed to load the chat"))
            analytics.track(error: error, context: "load_history")
        }
    }

    private func bindMessages() async {
        let stream = observeMessages(chatID: chatID)
        for await message in stream {
            await MainActor.run {
                let alreadyVisible = messages.contains(where: { $0.id == message.id })
                upsert(message: message)
                if !message.isOutgoing && !alreadyVisible && !isLoadingHistory {
                    notificationManager.scheduleLocalNotification(for: message)
                }
            }
        }
    }

    private func bindReachability() async {
        applyReachability(reachability.isReachable)
        for await isReachable in reachability.observe() {
            await MainActor.run {
                applyReachability(isReachable)
            }
        }
    }

    private func pollChatState() async {
        await refreshChatState()

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }
            await refreshChatState()
        }
    }

    private func refreshChatState() async {
        do {
            let chat = try await loadChatState(chatID)
            title = chat.title
            typingParticipants = chat.typingParticipants
            isTyping = !chat.typingParticipants.isEmpty
        } catch {
            // Background chat refresh is best-effort; the message stream remains usable offline.
        }
    }

    private func scheduleTypingUpdate() {
        let isTyping = !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        typingTask?.cancel()
        typingTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.setTypingState(self.chatID, isTyping)
        }
    }

    private func applyReachability(_ isReachable: Bool) {
        if isReachable {
            if case .offline? = banner {
                banner = nil
            }
            return
        }

        if banner == nil {
            banner = .offline
        }
    }

    private func upsert(message: Message) {
        if let index = messages.firstIndex(where: { $0.id == message.id }) {
            messages[index] = message
        } else {
            messages.append(message)
        }
        messages.sort { lhs, rhs in
            if lhs.createdAt == rhs.createdAt {
                return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
            }
            return lhs.createdAt < rhs.createdAt
        }
    }
}
