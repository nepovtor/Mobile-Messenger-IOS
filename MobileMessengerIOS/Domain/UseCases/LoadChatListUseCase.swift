import Foundation

public struct ObserveChatListUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func callAsFunction() -> AsyncStream<[Chat]> {
        repository.observeChats()
    }
}

public struct LoadChatListUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    public func cached(searchQuery: String?) async -> [Chat] {
        await repository.cachedChats(searchQuery: searchQuery)
    }

    public func callAsFunction(searchQuery: String?) async throws -> [Chat] {
        try await repository.listChats(searchQuery: searchQuery)
    }
}
