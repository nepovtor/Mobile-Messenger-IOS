import Foundation

public struct SetTypingUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(chatID: UUID, isTyping: Bool) async {
        await repository.setTyping(chatID: chatID, isTyping: isTyping)
    }
}
