import Foundation
import UIKit

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
    @Published public var replyTarget: Message?
    @Published public var inputText: String = ""
    @Published public var isTyping = false
    @Published public private(set) var isSendingMedia = false
    @Published public var banner: Banner?
    @Published public var isLoadingHistory = true

    private let chatID: UUID
    private let observeMessages: ObserveChatMessagesUseCase
    private let loadHistory: LoadChatHistoryUseCase
    private let sendMessageUseCase: SendMessageUseCase
    private let sendImageMessageUseCase: SendImageMessageUseCase
    private let setTypingUseCase: SetTypingUseCase
    private let retryPending: RetryPendingMessagesUseCase
    private let markStatus: MarkMessageStatusUseCase
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager
    private let reachability: ReachabilityService
    private let presentationStore: ChatPresentationStore

    private var observeTask: Task<Void, Never>?
    private var typingTask: Task<Void, Never>?
    private var reachabilityTask: Task<Void, Never>?
    private var isReachable = true
    private var lastReadRequestMessageID: UUID?
    private var knownMessageIDs: Set<UUID> = []
    init(
        chatID: UUID,
        title: String,
        observeMessages: ObserveChatMessagesUseCase,
        loadHistory: LoadChatHistoryUseCase,
        sendMessage: SendMessageUseCase,
        sendImageMessage: SendImageMessageUseCase,
        setTyping: SetTypingUseCase,
        retryPending: RetryPendingMessagesUseCase,
        markStatus: MarkMessageStatusUseCase,
        analytics: AnalyticsService,
        notificationManager: PushNotificationManager,
        reachability: ReachabilityService,
        presentationStore: ChatPresentationStore
    ) {
        self.chatID = chatID
        self.title = title
        self.observeMessages = observeMessages
        self.loadHistory = loadHistory
        self.sendMessageUseCase = sendMessage
        self.sendImageMessageUseCase = sendImageMessage
        self.setTypingUseCase = setTyping
        self.retryPending = retryPending
        self.markStatus = markStatus
        self.analytics = analytics
        self.notificationManager = notificationManager
        self.reachability = reachability
        self.presentationStore = presentationStore
    }

    deinit {
        observeTask?.cancel()
        typingTask?.cancel()
        reachabilityTask?.cancel()
    }

    public func onAppear() {
        guard observeTask == nil else { return }
        notificationManager.setChat(chatID, isActive: true)
        if inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            inputText = presentationStore.state(for: chatID).draft
            isTyping = !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        observeTask = Task { [weak self] in
            await self?.bindMessages()
        }
        reachabilityTask = Task { [weak self] in
            await self?.observeReachability()
        }
        Task { await loadInitialHistory() }
    }

    public func onDisappear() {
        notificationManager.setChat(chatID, isActive: false)
        observeTask?.cancel()
        observeTask = nil
        typingTask?.cancel()
        reachabilityTask?.cancel()
        reachabilityTask = nil
        Task { await setTypingUseCase(chatID: chatID, isTyping: false) }
    }

    public func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let replyTarget = replyTarget
        inputText = ""
        self.replyTarget = nil
        presentationStore.updateDraft("", for: chatID)
        scheduleTypingUpdate(isTyping: false)

        Task {
            do {
                let message = try await sendMessageUseCase(
                    chatID: chatID,
                    text: trimmed,
                    localID: UUID(),
                    repliedTo: replyTarget?.id
                )
                upsert(message: message)
                updateBannerState()
            } catch {
                banner = .error("Не удалось отправить сообщение. Попробуйте снова.")
                analytics.track(error: error, context: "send_message")
            }
        }
    }

    public func retryFailedMessages() {
        banner = isReachable ? nil : .offline
        Task { await retryPending(chatID: chatID) }
    }

    public func selectReplyTarget(_ message: Message) {
        replyTarget = message
    }

    public func clearReplyTarget() {
        replyTarget = nil
    }

    public func copyText(of message: Message) {
        guard !message.text.isEmpty else { return }
        UIPasteboard.general.string = message.text
    }

    public func message(for identifier: Message.Identifier) -> Message? {
        messages.first { $0.id == identifier }
    }

    public func handleInputChanged(_ text: String) {
        presentationStore.updateDraft(text, for: chatID)
        let shouldReportTyping = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard shouldReportTyping != isTyping else { return }
        isTyping = shouldReportTyping
        scheduleTypingUpdate(isTyping: shouldReportTyping)
    }

    public func sendImage(_ image: UIImage) {
        guard let prepared = image.preparedForUpload() else {
            banner = .error("Не удалось обработать изображение")
            return
        }

        let caption = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        let replyTarget = replyTarget
        inputText = ""
        self.replyTarget = nil
        presentationStore.updateDraft("", for: chatID)
        scheduleTypingUpdate(isTyping: false)
        isSendingMedia = true

        Task {
            defer { isSendingMedia = false }
            do {
                let message = try await sendImageMessageUseCase(
                    chatID: chatID,
                    imageData: prepared.data,
                    caption: caption.isEmpty ? nil : caption,
                    localID: UUID(),
                    repliedTo: replyTarget?.id
                )
                upsert(message: message)
                updateBannerState()
            } catch {
                banner = .error("Не удалось отправить фото")
                analytics.track(error: error, context: "send_image")
            }
        }
    }

    public func markMessageAsReadIfNeeded(_ message: Message) {
        guard !message.isOutgoing, message.status != .read else { return }
        guard lastReadRequestMessageID != message.id.messageID else { return }

        lastReadRequestMessageID = message.id.messageID
        Task { [weak self] in
            do {
                try await self?.markStatus(chatID: self?.chatID ?? message.id.chatID, messageID: message.id.messageID, status: .read)
            } catch {
                await MainActor.run {
                    if self?.lastReadRequestMessageID == message.id.messageID {
                        self?.lastReadRequestMessageID = nil
                    }
                }
            }
        }
    }

    public func firstUnreadIncomingMessageID() -> UUID? {
        messages.first(where: { !$0.isOutgoing && $0.status != .read })?.id.messageID
    }

    private func loadInitialHistory() async {
        isLoadingHistory = true
        let cachedHistory = await loadHistory.cached(chatID: chatID, limit: 100, before: nil)
        if !cachedHistory.isEmpty {
            replaceMessages(with: cachedHistory)
            isLoadingHistory = false
        }

        do {
            let history = try await loadHistory(chatID: chatID, limit: 100, before: nil)
            replaceMessages(with: history)
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
                let isNewIncomingMessage = !message.isOutgoing && !knownMessageIDs.contains(message.id.messageID)
                upsert(message: message)
                updateBannerState()
                if message.status == .read, lastReadRequestMessageID == message.id.messageID {
                    lastReadRequestMessageID = nil
                }
                if isNewIncomingMessage {
                    notificationManager.scheduleLocalNotification(for: message)
                }
            }
        }
    }

    private func scheduleTypingUpdate(isTyping: Bool) {
        typingTask?.cancel()
        typingTask = Task { [chatID, setTypingUseCase] in
            if isTyping {
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            await setTypingUseCase(chatID: chatID, isTyping: isTyping)
        }
    }

    private func upsert(message: Message) {
        if let index = messages.firstIndex(where: { $0.id == message.id || $0.localID == message.localID }) {
            messages[index] = message
        } else {
            messages.append(message)
        }
        knownMessageIDs.insert(message.id.messageID)
        messages.sort { lhs, rhs in
            if lhs.createdAt == rhs.createdAt {
                return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
            }
            return lhs.createdAt < rhs.createdAt
        }
    }

    private func replaceMessages(with newMessages: [Message]) {
        messages = newMessages.sorted { lhs, rhs in
            if lhs.createdAt == rhs.createdAt {
                return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
            }
            return lhs.createdAt < rhs.createdAt
        }
        knownMessageIDs = Set(messages.map(\.id.messageID))
    }

    private func observeReachability() async {
        isReachable = reachability.isReachable
        await MainActor.run {
            updateBannerState()
        }
        for await reachable in reachability.observe() {
            await MainActor.run {
                isReachable = reachable
                updateBannerState()
            }
        }
    }

    private func updateBannerState() {
        if messages.contains(where: { $0.isOutgoing && $0.status == .failed }) {
            banner = .error("Не удалось отправить сообщение. Попробуйте снова.")
            return
        }
        if !isReachable {
            banner = .offline
            return
        }
        if case .offline = banner {
            banner = nil
            return
        }
        if case .error = banner,
           !messages.contains(where: { $0.isOutgoing && $0.status == .failed }) {
            banner = nil
        }
    }
}

private struct PreparedUpload {
    let data: Data
}

private extension UIImage {
    func preparedForUpload() -> PreparedUpload? {
        let target = CGSize(width: 1600, height: 1600)
        let scale = min(target.width / size.width, target.height / size.height, 1)
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        let image = renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }

        guard let data = image.jpegData(compressionQuality: 0.78) else { return nil }
        return PreparedUpload(data: data)
    }
}
