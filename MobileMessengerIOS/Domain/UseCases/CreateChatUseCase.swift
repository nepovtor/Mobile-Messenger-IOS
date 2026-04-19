import Foundation

public struct CreateChatUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(title: String, participantContacts: [String] = []) async throws -> Chat {
        try await repository.createChat(title: title, participantContacts: participantContacts)
    }
}

public struct DeleteChatUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(chatID: UUID) async throws {
        try await repository.deleteChat(id: chatID)
    }
}
