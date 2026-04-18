import Foundation

public struct Message: Identifiable, Hashable, Sendable {
    public struct Identifier: Hashable, Codable, Sendable {
        public let chatID: UUID
        public let messageID: UUID

        public init(chatID: UUID, messageID: UUID) {
            self.chatID = chatID
            self.messageID = messageID
        }
    }

    public let id: Identifier
    public let localID: UUID
    public let authorID: String
    public let authorName: String
    public let text: String
    public let createdAt: Date
    public let isOutgoing: Bool
    public let status: MessageStatus
    public let attachments: [MessageAttachment]
    public let repliedTo: Identifier?
    public let editedAt: Date?

    public init(
        id: Identifier,
        localID: UUID,
        authorID: String,
        authorName: String,
        text: String,
        createdAt: Date,
        isOutgoing: Bool,
        status: MessageStatus,
        attachments: [MessageAttachment] = [],
        repliedTo: Identifier? = nil,
        editedAt: Date? = nil
    ) {
        self.id = id
        self.localID = localID
        self.authorID = authorID
        self.authorName = authorName
        self.text = text
        self.createdAt = createdAt
        self.isOutgoing = isOutgoing
        self.status = status
        self.attachments = attachments
        self.repliedTo = repliedTo
        self.editedAt = editedAt
    }

    public func updatingStatus(_ status: MessageStatus) -> Message {
        Message(
            id: id,
            localID: localID,
            authorID: authorID,
            authorName: authorName,
            text: text,
            createdAt: createdAt,
            isOutgoing: isOutgoing,
            status: status,
            attachments: attachments,
            repliedTo: repliedTo,
            editedAt: editedAt
        )
    }
}
