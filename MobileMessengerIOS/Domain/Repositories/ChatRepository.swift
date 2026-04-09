import Foundation

public protocol ChatRepository {
    func listChats(searchQuery: String?) async throws -> [Chat]
    func getChat(_ chatID: UUID) async throws -> Chat
    func observeChat(_ chatID: UUID) -> AsyncStream<Chat>
    func createChat(title: String, participantIDs: [UUID], isDirect: Bool) async throws -> Chat
    func observeMessages(for chatID: UUID) -> AsyncStream<Message>
    func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message]
    func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message
    func retryPendingMessages(for chatID: UUID) async
    func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws
    func setTyping(in chatID: UUID, isTyping: Bool) async
}
