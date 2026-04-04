import Foundation

@MainActor
public final class ChatViewModel: ObservableObject {
    public enum Banner: Identifiable {
        case error(String)
        case offline

        public var id: String {
            switch self {
            case .error(let message):
                return "error_\(message)"
            case .offline:
                return "offline"
            }
        }
    }

    @Published public private(set) var title: String
    @Published public private(set) var messages: [Message] = []
    @Published public var inputText: String = ""
    @Published public var isTyping = false
    @Published public var banner: Banner?
    @Published public var isLoadingHistory = true

    private let chatID: UUID
    private let observeMessages: ObserveChatMessagesUseCase
    private let loadHistory: LoadChatHistoryUseCase
    private let sendMessageUseCase: SendMessageUseCase
    private let retryPending: RetryPendingMessagesUseCase
    private let markStatus: MarkMessageStatusUseCase
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager

    private var observeTask: Task<Void, Never>?
    public init(
        chatID: UUID,
        title: String,
        observeMessages: ObserveChatMessagesUseCase,
        loadHistory: LoadChatHistoryUseCase,
        sendMessage: SendMessageUseCase,
        retryPending: RetryPendingMessagesUseCase,
        markStatus: MarkMessageStatusUseCase,
        analytics: AnalyticsService,
        notificationManager: PushNotificationManager = .shared
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

    public func onAppear() {
        guard observeTask == nil else { return }
        observeTask = Task { [weak self] in
            await self?.bindMessages()
        }
        Task { await loadInitialHistory() }
    }

    public func onDisappear() {
        observeTask?.cancel()
        observeTask = nil
    }

    public func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        inputText = ""

        Task {
            do {
                let message = try await sendMessageUseCase(chatID: chatID, text: trimmed, localID: UUID())
                messages.append(message)
                analytics.track(event: AnalyticsEvent(kind: .messageSent, metadata: ["chatID": chatID.uuidString]))
            } catch {
                banner = .error("Не удалось отправить сообщение. Попробуйте снова.")
                analytics.track(error: error, context: "send_message")
            }
        }
    }

    public func retryFailedMessages() {
        Task { await retryPending(chatID: chatID) }
    }

    public func markAsRead(messageID: UUID) {
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
