import Foundation
import UIKit

@MainActor
final class ChatViewModel: ObservableObject {
    static let defaultChatID = UUID(uuidString: "11111111-2222-3333-4444-555555555555") ?? UUID()
    static let defaultChatTitle = "Диалог"

    @Published private(set) var messages: [ChatMessage] = []
    @Published var isTyping = false
    @Published private(set) var title: String

    private let chatID: UUID
    private let chatCache: ChatCache
    private let realtimeClient: ChatRealtimeClient
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager

    init(
        chatID: UUID = ChatViewModel.defaultChatID,
        chatTitle: String = ChatViewModel.defaultChatTitle,
        chatCache: ChatCache = SwiftDataChatCache.shared,
        realtimeClient: ChatRealtimeClient = DefaultChatRealtimeClient(),
        analytics: AnalyticsService = DefaultAnalyticsService.shared,
        notificationManager: PushNotificationManager = .shared
    ) {
        self.chatID = chatID
        self.title = chatTitle
        self.chatCache = chatCache
        self.realtimeClient = realtimeClient
        self.analytics = analytics
        self.notificationManager = notificationManager

        chatCache.ensureChatExists(id: chatID, title: chatTitle)
        loadCachedMessages()
        bindRealtimeEvents()
    }

    deinit {
        realtimeClient.disconnect()
    }

    func start() {
        realtimeClient.connect()
    }

    func stop() {
        realtimeClient.disconnect()
    }

    func trackChatOpened() {
        analytics.trackChatOpened(chatID: chatID)
    }

    func sendMessage(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let newMessage = ChatMessage(text: trimmed, isOutgoing: true, status: .sending)
        messages.append(newMessage)
        persist(message: newMessage)
        analytics.trackMessageSent(chatID: chatID, messageID: newMessage.id)

        Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: 600_000_000)
            await MainActor.run {
                self.updateStatus(for: newMessage.id, to: .sent)
            }
            try? await Task.sleep(nanoseconds: 600_000_000)
            await MainActor.run {
                self.updateStatus(for: newMessage.id, to: .delivered)
            }
            try? await Task.sleep(nanoseconds: 800_000_000)
            await MainActor.run {
                self.updateStatus(for: newMessage.id, to: .read)
            }
        }

        realtimeClient.send(text: trimmed)
    }

    // MARK: - Private

    private func bindRealtimeEvents() {
        realtimeClient.onMessage = { [weak self] text in
            guard let self else { return }
            Task { @MainActor in
                let message = ChatMessage(text: text, isOutgoing: false, status: .delivered)
                self.messages.append(message)
                self.persist(message: message)
                self.analytics.trackMessageReceived(chatID: self.chatID, messageID: message.id)
                self.notificationManager.scheduleLocalNotification(for: message)
            }
        }

        realtimeClient.onTyping = { [weak self] typing in
            guard let self else { return }
            Task { @MainActor in
                self.isTyping = typing
            }
        }

        realtimeClient.onError = { [weak self] error in
            self?.analytics.trackNetworkError(error)
        }
    }

    private func updateStatus(for id: UUID, to status: ChatMessage.DeliveryStatus) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].status = status
        do {
            try chatCache.updateStatus(for: id, to: status)
        } catch {
            analytics.trackStorageError(error)
        }
    }

    private func persist(message: ChatMessage) {
        do {
            try chatCache.saveMessage(message, in: chatID)
        } catch {
            analytics.trackStorageError(error)
        }
    }

    private func loadCachedMessages() {
        do {
            messages = try chatCache.loadMessages(for: chatID)
        } catch {
            analytics.trackStorageError(error)
        }
    }
}
