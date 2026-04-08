import Foundation

public enum ChatRealtimeEvent: Sendable {
    case connected
    case disconnected(Error?)
    case message(Message)
    case chatUpdated(Chat)
    case typing(Bool)
}

public protocol ChatRealtimeService: Sendable {
    func connect(to chatID: UUID)
    func disconnect(from chatID: UUID)
    func sendMessage(chatID: UUID, text: String, localID: UUID) async throws
    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent>
}
