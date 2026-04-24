import Foundation

public protocol ChatLocalStore: Sendable {
    func ensureChatExists(id: UUID, title: String) async throws
    func upsert(chats: [Chat]) async throws
    func replaceChats(with chats: [Chat]) async throws
    func upsert(messages: [Message], for chatID: UUID) async throws
    func append(message: Message, for chatID: UUID) async throws
    func replaceMessage(localID: UUID, in chatID: UUID, with message: Message) async throws
    func loadMessages(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message]
    func observeChats() -> AsyncStream<[Chat]>
    func observeMessages(for chatID: UUID) -> AsyncStream<Message>
    func fetchChats(searchQuery: String?) async throws -> [Chat]
    func containsChat(id: UUID) async -> Bool
    func updateTypingParticipants(_ participants: [String], in chatID: UUID) async throws
    func updateStatus(for messageID: UUID, in chatID: UUID, status: MessageStatus) async throws
    func updateStatus(forLocalID localID: UUID, in chatID: UUID, status: MessageStatus) async throws
    func pendingMessages(in chatID: UUID) async throws -> [Message]
    func allPendingMessages() async throws -> [Message]
    func purgeMessages(olderThan date: Date) async throws
    func reset() async throws
}
