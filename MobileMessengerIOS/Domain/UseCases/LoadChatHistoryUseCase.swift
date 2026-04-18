import Foundation

public struct LoadChatHistoryUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func cached(chatID: UUID, limit: Int, before messageID: UUID?) async -> [Message] {
        await repository.cachedHistory(for: chatID, limit: limit, before: messageID)
    }

    public func callAsFunction(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message] {
        try await repository.loadHistory(for: chatID, limit: limit, before: messageID)
    }
}
