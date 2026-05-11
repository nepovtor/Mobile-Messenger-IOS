import Foundation

public enum ChatRealtimeConnectionState: Equatable, Sendable {
    case disconnected
    case connecting(retry: Int)
    case connected
    case reconnecting(retry: Int)
    case failed(reason: String)
}

public enum ChatRealtimeEvent: Sendable {
    case chatCreated(Chat)
    case chatDeleted
    case connected
    case disconnected(Error?)
    case message(Message)
    case messageUpdated(Message)
    case messageDeleted(Message)
    case messageRead(messageID: UUID)
    case typing(participants: [String])
}

public struct ChatRealtimeEnvelope: Sendable {
    public let chatID: UUID
    public let event: ChatRealtimeEvent

    public init(chatID: UUID, event: ChatRealtimeEvent) {
        self.chatID = chatID
        self.event = event
    }
}

public protocol ChatRealtimeService: Sendable {
    func activate()
    func deactivate()
    func handleLogout()
    func connect(to chatID: UUID)
    func disconnect(from chatID: UUID)
    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent>
    func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope>
    func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState>
    func sendMessage(
        chatID: UUID,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        clientMessageID: UUID
    ) async throws -> Message
    func setTyping(chatID: UUID, isTyping: Bool) async
    func markRead(chatID: UUID, messageID: UUID) async
}
