import Foundation

public struct ObserveChatMessagesUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(chatID: UUID) -> AsyncStream<Message> {
        repository.observeMessages(for: chatID)
    }
}
