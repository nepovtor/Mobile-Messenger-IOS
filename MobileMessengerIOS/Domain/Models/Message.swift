import Foundation

public struct Message: Identifiable, Hashable, Sendable, Codable {
    public enum Kind: String, Codable, Sendable {
        case text
        case image
    }

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
    public let authorID: UUID
    public let authorName: String
    public let kind: Kind
    public let text: String
    public let mediaID: UUID?
    public let createdAt: Date
    public let status: MessageStatus
    public let attachments: [MessageAttachment]
    public let repliedTo: Identifier?
    public let editedAt: Date?
    public let deletedAt: Date?

    public init(
        id: Identifier,
        localID: UUID,
        authorID: UUID,
        authorName: String,
        kind: Kind = .text,
        text: String,
        mediaID: UUID? = nil,
        createdAt: Date,
        status: MessageStatus,
        attachments: [MessageAttachment] = [],
        repliedTo: Identifier? = nil,
        editedAt: Date? = nil,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.localID = localID
        self.authorID = authorID
        self.authorName = authorName
        self.kind = kind
        self.text = text
        self.mediaID = mediaID
        self.createdAt = createdAt
        self.status = status
        self.attachments = attachments
        self.repliedTo = repliedTo
        self.editedAt = editedAt
        self.deletedAt = deletedAt
    }

    public var isOutgoing: Bool {
        authorID == SessionStore.Constants.currentUserID
    }

    public func updatingStatus(_ status: MessageStatus) -> Message {
        Message(
            id: id,
            localID: localID,
            authorID: authorID,
            authorName: authorName,
            kind: kind,
            text: text,
            mediaID: mediaID,
            createdAt: createdAt,
            status: status,
            attachments: attachments,
            repliedTo: repliedTo,
            editedAt: editedAt,
            deletedAt: deletedAt
        )
    }

    public func replacingContent(
        text: String,
        mediaID: UUID? = nil,
        attachments: [MessageAttachment]? = nil,
        editedAt: Date? = nil,
        deletedAt: Date? = nil
    ) -> Message {
        Message(
            id: id,
            localID: localID,
            authorID: authorID,
            authorName: authorName,
            kind: kind,
            text: text,
            mediaID: mediaID,
            createdAt: createdAt,
            status: status,
            attachments: attachments ?? self.attachments,
            repliedTo: repliedTo,
            editedAt: editedAt,
            deletedAt: deletedAt
        )
    }

    public var primaryImageURL: URL? {
        attachments.first(where: { $0.kind == .image })?.url
    }
}
