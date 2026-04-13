import Foundation

public protocol ChatRepository {
    func createChat(title: String, participantContacts: [String]) async throws -> Chat
    func listChats(searchQuery: String?) async throws -> [Chat]
    func observeMessages(for chatID: UUID) -> AsyncStream<Message>
    func loadHistory(for chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [Message]
    func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message
    func sendImageMessage(chatID: UUID, imageData: Data, caption: String?, localID: UUID?) async throws -> Message
    func setTyping(chatID: UUID, isTyping: Bool) async
    func retryPendingMessages(for chatID: UUID) async
    func markMessage(_ messageID: UUID, in chatID: UUID, with status: MessageStatus) async throws
}
