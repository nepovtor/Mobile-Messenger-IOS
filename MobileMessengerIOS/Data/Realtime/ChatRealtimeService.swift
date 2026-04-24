import Foundation

public enum ChatRealtimeConnectionState: Equatable, Sendable {
    case disconnected
    case connecting(retry: Int)
    case connected
    case reconnecting(retry: Int)
    case failed(reason: String)
}

public enum ChatRealtimeEvent: Sendable {
    case connected
    case disconnected(Error?)
    case message(Message)
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
}
