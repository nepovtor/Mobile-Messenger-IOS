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

public struct EditMessageUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    @discardableResult
    public func callAsFunction(chatID: UUID, messageID: UUID, text: String) async throws -> Message {
        try await repository.editMessage(chatID: chatID, messageID: messageID, text: text)
    }
}

public struct DeleteMessageUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    @discardableResult
    public func callAsFunction(chatID: UUID, messageID: UUID) async throws -> Message {
        try await repository.deleteMessage(chatID: chatID, messageID: messageID)
    }
}
