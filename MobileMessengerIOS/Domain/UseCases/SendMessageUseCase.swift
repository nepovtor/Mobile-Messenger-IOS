import Foundation

public struct SendMessageUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    @discardableResult
    public func callAsFunction(chatID: UUID, text: String, localID: UUID? = nil) async throws -> Message {
        try await repository.sendMessage(chatID: chatID, text: text, localID: localID)
    }
}
