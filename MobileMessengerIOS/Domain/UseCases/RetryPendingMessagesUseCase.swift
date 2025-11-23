import Foundation

public struct RetryPendingMessagesUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(chatID: UUID) async {
        await repository.retryPendingMessages(for: chatID)
    }
}
