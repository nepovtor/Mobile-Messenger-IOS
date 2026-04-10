import Foundation

public enum ChatRealtimeEvent: Sendable {
    case connected
    case disconnected(Error?)
    case message(Message)
    case messageRead(messageID: UUID)
    case typing(participants: [String])
}

public protocol ChatRealtimeService: Sendable {
    func connect(to chatID: UUID)
    func disconnect(from chatID: UUID)
    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent>
}
