import Foundation

public struct MarkMessageStatusUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(chatID: UUID, messageID: UUID, status: MessageStatus) async throws {
        try await repository.markMessage(messageID, in: chatID, with: status)
    }
}
