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
    @Published public var inputText: String = ""
    @Published public var isTyping = false
    @Published public private(set) var isSendingMedia = false
    @Published public private(set) var isNetworkReachable = true
    @Published public var banner: Banner?
    @Published public var isLoadingHistory = true
    @Published public private(set) var isLoadingOlderHistory = false
    @Published public private(set) var hasMoreHistory = true
    @Published public var activeEditMessage: Message?

    private let chatID: UUID
    private let observeMessages: ObserveChatMessagesUseCase
    private let loadHistory: LoadChatHistoryUseCase
    private let sendMessageUseCase: SendMessageUseCase
    private let sendImageMessageUseCase: SendImageMessageUseCase
    private let sendAudioMessageUseCase: SendAudioMessageUseCase?
    private let editMessageUseCase: EditMessageUseCase
    private let deleteMessageUseCase: DeleteMessageUseCase
    private let setTypingUseCase: SetTypingUseCase
    private let retryPending: RetryPendingMessagesUseCase
    private let markStatus: MarkMessageStatusUseCase
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService

    private var observeTask: Task<Void, Never>?
    private var olderHistoryTask: Task<Void, Never>?
    private var typingTask: Task<Void, Never>?
    private var reachabilityTask: Task<Void, Never>?
    private var messageIndexByID: [UUID: Int] = [:]
    private var messageIndexByLocalID: [UUID: Int] = [:]
    private var failedOutgoingMessageIDs: Set<UUID> = []
    private var lastMarkedReadMessageID: UUID?
    init(
        chatID: UUID,
        title: String,
        observeMessages: ObserveChatMessagesUseCase,
        loadHistory: LoadChatHistoryUseCase,
        sendMessage: SendMessageUseCase,
        sendImageMessage: SendImageMessageUseCase,
        sendAudioMessage: SendAudioMessageUseCase? = nil,
        editMessage: EditMessageUseCase,
        deleteMessage: DeleteMessageUseCase,
        setTyping: SetTypingUseCase,
        retryPending: RetryPendingMessagesUseCase,
        markStatus: MarkMessageStatusUseCase,
        analytics: AnalyticsService,
        reachability: ReachabilityService
    ) {
        self.chatID = chatID
        self.title = title
        self.observeMessages = observeMessages
        self.loadHistory = loadHistory
        self.sendMessageUseCase = sendMessage
        self.sendImageMessageUseCase = sendImageMessage
        self.sendAudioMessageUseCase = sendAudioMessage
        self.editMessageUseCase = editMessage
        self.deleteMessageUseCase = deleteMessage
        self.setTypingUseCase = setTyping
        self.retryPending = retryPending
        self.markStatus = markStatus
        self.analytics = analytics
        self.reachability = reachability
    }

    deinit {
        observeTask?.cancel()
        olderHistoryTask?.cancel()
        typingTask?.cancel()
        reachabilityTask?.cancel()
    }

    public func onAppear() {
        guard observeTask == nil else { return }
        observeTask = Task { [weak self] in
            guard let self else { return }
            await loadInitialHistory()
            guard !Task.isCancelled else { return }
            await bindMessages()
        }
        if reachabilityTask == nil {
            reachabilityTask = Task { [weak self] in
                await self?.observeReachability()
            }
        }
    }

    public func onDisappear() {
        observeTask?.cancel()
        observeTask = nil
        olderHistoryTask?.cancel()
        olderHistoryTask = nil
        isLoadingOlderHistory = false
        typingTask?.cancel()
        reachabilityTask?.cancel()
        reachabilityTask = nil
        Task { await setTypingUseCase(chatID: chatID, isTyping: false) }
    }

    public func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        inputText = ""
        scheduleTypingUpdate(isTyping: false)

        Task {
            do {
                let message = try await sendMessageUseCase(chatID: chatID, text: trimmed, localID: UUID())
                upsert(message: message)
                updateBannerState()
            } catch {
                banner = .error("Не удалось отправить сообщение. Попробуйте снова.")
                analytics.track(error: error, context: "send_message")
            }
        }
    }

    public func retryFailedMessages() {
        banner = isNetworkReachable ? nil : .offline
        Task { await retryPending(chatID: chatID) }
    }

    public func loadOlderMessages() {
        guard !isLoadingHistory,
              !isLoadingOlderHistory,
              hasMoreHistory,
              let oldestMessageID = messages.first?.id.messageID else {
            return
        }

        isLoadingOlderHistory = true
        olderHistoryTask = Task { [weak self] in
            await self?.loadOlderMessages(before: oldestMessageID)
        }
    }

    public func handleInputChanged(_ text: String) {
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
        inputText = ""
        scheduleTypingUpdate(isTyping: false)
        isSendingMedia = true

        Task {
            defer { isSendingMedia = false }
            do {
                let message = try await sendImageMessageUseCase(
                    chatID: chatID,
                    imageData: prepared.data,
                    caption: caption.isEmpty ? nil : caption,
                    localID: UUID()
                )
                upsert(message: message)
                updateBannerState()
            } catch {
                banner = .error(AppError.presentableMessage(for: error))
                analytics.track(error: error, context: "send_image")
            }
        }
    }

    public func sendAudio(_ data: Data) {
        guard !data.isEmpty else {
            banner = .error("Запись голосового сообщения пуста")
            return
        }
        guard data.count <= 20_000_000 else {
            banner = .error("Голосовое сообщение превышает 20 МБ")
            return
        }
        guard let sendAudioMessageUseCase else {
            banner = .error("Отправка голосовых сообщений недоступна")
            return
        }

        isSendingMedia = true
        Task {
            defer { isSendingMedia = false }
            do {
                let message = try await sendAudioMessageUseCase(
                    chatID: chatID,
                    audioData: data,
                    localID: UUID()
                )
                upsert(message: message)
                updateBannerState()
            } catch {
                banner = .error(AppError.presentableMessage(for: error))
                analytics.track(error: error, context: "send_audio")
            }
        }
    }

    public func markAsRead(messageID: UUID) {
        guard lastMarkedReadMessageID != messageID else { return }
        lastMarkedReadMessageID = messageID
        Task {
            do {
                try await markStatus(chatID: chatID, messageID: messageID, status: .read)
            } catch {
                if lastMarkedReadMessageID == messageID {
                    lastMarkedReadMessageID = nil
                }
            }
        }
    }

    public func beginEditing(_ message: Message) {
        guard message.isOutgoing, message.kind == .text, message.deletedAt == nil else { return }
        activeEditMessage = message
    }

    public func cancelEditing() {
        activeEditMessage = nil
    }

    public func saveEdit(text: String) {
        guard let activeEditMessage else { return }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            banner = .error("Сообщение не может быть пустым.")
            return
        }

        Task {
            do {
                let updated = try await editMessageUseCase(
                    chatID: chatID,
                    messageID: activeEditMessage.id.messageID,
                    text: trimmed
                )
                await MainActor.run {
                    upsert(message: updated)
                    self.activeEditMessage = nil
                }
            } catch {
                await MainActor.run {
                    banner = .error("Не удалось изменить сообщение.")
                }
                analytics.track(error: error, context: "edit_message")
            }
        }
    }

    public func deleteMessage(_ message: Message) {
        guard message.isOutgoing, message.deletedAt == nil else { return }

        Task {
            do {
                let deleted = try await deleteMessageUseCase(
                    chatID: chatID,
                    messageID: message.id.messageID
                )
                await MainActor.run {
                    upsert(message: deleted)
                }
            } catch {
                await MainActor.run {
                    banner = .error("Не удалось удалить сообщение.")
                }
                analytics.track(error: error, context: "delete_message")
            }
        }
    }

    private func loadInitialHistory() async {
        let pageSize = 100
        isLoadingHistory = true
        let cachedHistory = await loadHistory.cached(chatID: chatID, limit: pageSize, before: nil)
        if !cachedHistory.isEmpty {
            merge(messages: cachedHistory)
            hasMoreHistory = cachedHistory.count >= pageSize
            isLoadingHistory = false
        }

        do {
            let history = try await loadHistory(chatID: chatID, limit: pageSize, before: nil)
            merge(messages: history)
            hasMoreHistory = history.count >= pageSize
            updateBannerState()
            isLoadingHistory = false
        } catch {
            isLoadingHistory = false
            banner = .error("Не удалось загрузить чат")
            analytics.track(error: error, context: "load_history")
        }
    }

    private func loadOlderMessages(before messageID: UUID) async {
        defer {
            isLoadingOlderHistory = false
            olderHistoryTask = nil
        }

        let pageSize = 100
        do {
            let olderMessages = try await loadHistory(
                chatID: chatID,
                limit: pageSize,
                before: messageID
            )
            guard !Task.isCancelled else { return }
            merge(messages: olderMessages)
            hasMoreHistory = olderMessages.count >= pageSize
        } catch {
            analytics.track(error: error, context: "load_older_messages")
        }
    }

    private func bindMessages() async {
        let stream = await observeMessages(chatID: chatID)
        for await message in stream {
            guard message.id.chatID == chatID else { continue }
            upsert(message: message)
            updateBannerState()
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
        if let index = existingIndex(for: message) {
            let previous = messages[index]
            messages[index] = message
            failedOutgoingMessageIDs.remove(previous.localID)
            updateFailedMessageIndex(with: message)

            messageIndexByID[previous.id.messageID] = nil
            messageIndexByLocalID[previous.localID] = nil
            if previous.createdAt == message.createdAt,
               previous.id.messageID == message.id.messageID {
                messageIndexByID[message.id.messageID] = index
                messageIndexByLocalID[message.localID] = index
            } else {
                messages.sort(by: Self.sortMessages)
                rebuildMessageIndices()
            }
        } else if let lastMessage = messages.last,
                  Self.sortMessages(lhs: lastMessage, rhs: message) {
            messages.append(message)
            let index = messages.index(before: messages.endIndex)
            messageIndexByID[message.id.messageID] = index
            messageIndexByLocalID[message.localID] = index
            updateFailedMessageIndex(with: message)
        } else {
            messages.insert(message, at: insertionIndex(for: message))
            rebuildMessageIndices()
        }
    }

    private func merge(messages newMessages: [Message]) {
        for message in newMessages {
            if let index = existingIndex(for: message) {
                let previous = messages[index]
                messageIndexByID[previous.id.messageID] = nil
                messageIndexByLocalID[previous.localID] = nil
                messages[index] = message
                messageIndexByID[message.id.messageID] = index
                messageIndexByLocalID[message.localID] = index
            } else {
                let index = messages.endIndex
                messages.append(message)
                messageIndexByID[message.id.messageID] = index
                messageIndexByLocalID[message.localID] = index
            }
        }
        messages.sort(by: Self.sortMessages)
        rebuildMessageIndices()
    }

    private func existingIndex(for message: Message) -> Int? {
        messageIndexByID[message.id.messageID] ??
        messageIndexByLocalID[message.localID]
    }

    private func insertionIndex(for message: Message) -> Int {
        var lowerBound = messages.startIndex
        var upperBound = messages.endIndex
        while lowerBound < upperBound {
            let middle = lowerBound + (upperBound - lowerBound) / 2
            if Self.sortMessages(lhs: messages[middle], rhs: message) {
                lowerBound = middle + 1
            } else {
                upperBound = middle
            }
        }
        return lowerBound
    }

    private func rebuildMessageIndices() {
        messageIndexByID.removeAll(keepingCapacity: true)
        messageIndexByLocalID.removeAll(keepingCapacity: true)
        failedOutgoingMessageIDs.removeAll(keepingCapacity: true)
        for (index, message) in messages.enumerated() {
            messageIndexByID[message.id.messageID] = index
            messageIndexByLocalID[message.localID] = index
            updateFailedMessageIndex(with: message)
        }
    }

    private func updateFailedMessageIndex(with message: Message) {
        if message.isOutgoing && message.status == .failed {
            failedOutgoingMessageIDs.insert(message.localID)
        } else {
            failedOutgoingMessageIDs.remove(message.localID)
        }
    }

    private static func sortMessages(lhs: Message, rhs: Message) -> Bool {
        if lhs.createdAt == rhs.createdAt {
            return lhs.id.messageID.uuidString < rhs.id.messageID.uuidString
        }
        return lhs.createdAt < rhs.createdAt
    }

    private func observeReachability() async {
        isNetworkReachable = reachability.isReachable
        await MainActor.run {
            updateBannerState()
        }
        for await reachable in reachability.observe() {
            await MainActor.run {
                isNetworkReachable = reachable
                updateBannerState()
            }
        }
    }

    private func updateBannerState() {
        if !failedOutgoingMessageIDs.isEmpty {
            banner = .error("Не удалось отправить сообщение. Попробуйте снова.")
            return
        }
        if !isNetworkReachable {
            banner = .offline
            return
        }
        if case .offline = banner {
            banner = nil
            return
        }
        if case .error = banner,
           failedOutgoingMessageIDs.isEmpty {
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
