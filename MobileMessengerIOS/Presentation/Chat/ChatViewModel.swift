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
    @Published var inputText: String = ""
    @Published var isTyping = false
    @Published var banner: Banner?
    @Published var isLoadingHistory = true

    private let observeMessages: ObserveChatMessagesUseCase
    private let loadHistory: LoadChatHistoryUseCase
    private let sendMessageUseCase: SendMessageUseCase
    private let retryPending: RetryPendingMessagesUseCase
    private let markStatus: MarkMessageStatusUseCase
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager

    private var observeTask: Task<Void, Never>?
    init(
        chatID: UUID,
        title: String,
        observeMessages: ObserveChatMessagesUseCase,
        loadHistory: LoadChatHistoryUseCase,
        sendMessage: SendMessageUseCase,
        retryPending: RetryPendingMessagesUseCase,
        markStatus: MarkMessageStatusUseCase,
        analytics: AnalyticsService,
        notificationManager: PushNotificationManager
    ) {
        self.chatID = chatID
        self.title = title
        self.observeMessages = observeMessages
        self.loadHistory = loadHistory
        self.sendMessageUseCase = sendMessage
        self.retryPending = retryPending
        self.markStatus = markStatus
        self.analytics = analytics
        self.notificationManager = notificationManager
    }

    deinit {
        observeTask?.cancel()
    }

    func onAppear() {
        guard observeTask == nil else { return }
        observeTask = Task { [weak self] in
            await self?.bindMessages()
        }
        Task { await loadInitialHistory() }
    }

    func onDisappear() {
        observeTask?.cancel()
        observeTask = nil
    }

    func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        inputText = ""

        Task {
            do {
                let message = try await sendMessageUseCase(chatID: chatID, text: trimmed, localID: UUID())
                upsert(message: message)
            } catch {
                banner = .error("Не удалось отправить сообщение. Попробуйте снова.")
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

    private func loadInitialHistory() async {
        isLoadingHistory = true
        do {
            let history = try await loadHistory(chatID: chatID, limit: 100, before: nil)
            messages = history
            isLoadingHistory = false
        } catch {
            isLoadingHistory = false
            banner = .error("Не удалось загрузить чат")
            analytics.track(error: error, context: "load_history")
        }
    }

    private func bindMessages() async {
        let stream = observeMessages(chatID: chatID)
        for await message in stream {
            await MainActor.run {
                upsert(message: message)
                if !message.isOutgoing {
                    notificationManager.scheduleLocalNotification(for: message)
                }
            }
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
