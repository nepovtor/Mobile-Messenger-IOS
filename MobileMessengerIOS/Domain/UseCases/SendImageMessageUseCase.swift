import Foundation

public struct SendImageMessageUseCase {
    private let repository: ChatRepository

    public init(repository: ChatRepository) {
        self.repository = repository
    }

    @discardableResult
    public func callAsFunction(
        chatID: UUID,
        imageData: Data,
        caption: String?,
        localID: UUID? = nil,
        repliedTo: Message.Identifier? = nil
    ) async throws -> Message {
        try await repository.sendImageMessage(
            chatID: chatID,
            imageData: imageData,
            caption: caption,
            localID: localID,
            repliedTo: repliedTo
        )
    }
}
