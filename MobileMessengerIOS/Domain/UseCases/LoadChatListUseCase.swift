import Foundation

public struct LoadChatListUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction(searchQuery: String?) async throws -> [Chat] {
        try await repository.listChats(searchQuery: searchQuery)
    }
}
