import Foundation
import Combine

@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = [
        ChatMessage(text: "Привет! Как дела?", isOutgoing: true, status: .read),
        ChatMessage(text: "Привет! Все хорошо, спасибо", isOutgoing: false, status: .delivered),
        ChatMessage(text: "Когда встретимся?", isOutgoing: true, status: .delivered),
        ChatMessage(text: "Давай завтра вечером", isOutgoing: false, status: .delivered)
    ]
    @Published var isTyping = false

    private let realtimeClient: ChatRealtimeClient

    init(realtimeClient: ChatRealtimeClient = DefaultChatRealtimeClient()) {
        self.realtimeClient = realtimeClient
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

    func sendMessage(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let newMessage = ChatMessage(text: trimmed, isOutgoing: true, status: .sending)
        messages.append(newMessage)

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

    private func bindRealtimeEvents() {
        realtimeClient.onMessage = { [weak self] text in
            guard let self else { return }
            Task {
                await MainActor.run {
                    let message = ChatMessage(text: text, isOutgoing: false, status: .delivered)
                    self.messages.append(message)
                }
            }
        }

        realtimeClient.onTyping = { [weak self] typing in
            guard let self else { return }
            Task {
                await MainActor.run {
                    self.isTyping = typing
                }
            }
        }
    }

    private func updateStatus(for id: UUID, to status: ChatMessage.DeliveryStatus) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].status = status
    }
}
