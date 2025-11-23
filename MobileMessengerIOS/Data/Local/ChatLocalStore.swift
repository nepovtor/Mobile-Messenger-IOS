import Foundation

public protocol ChatLocalStore: Sendable {
    func ensureChatExists(id: UUID, title: String) async throws
    func upsert(messages: [Message], for chatID: UUID) async throws
    func append(message: Message, for chatID: UUID) async throws
    func loadMessages(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message]
    func observeMessages(for chatID: UUID) -> AsyncStream<Message>
    func fetchChats(searchQuery: String?) async throws -> [Chat]
    func updateStatus(for messageID: UUID, in chatID: UUID, status: MessageStatus) async throws
    func pendingMessages(in chatID: UUID) async throws -> [Message]
    func purgeMessages(olderThan date: Date) async throws
}
