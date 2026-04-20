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
        editedAt: Date? = nil
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
            editedAt: editedAt
        )
    }

    public func copying(
        id: Identifier? = nil,
        localID: UUID? = nil,
        authorID: UUID? = nil,
        authorName: String? = nil,
        kind: Kind? = nil,
        text: String? = nil,
        mediaID: UUID?? = nil,
        createdAt: Date? = nil,
        status: MessageStatus? = nil,
        attachments: [MessageAttachment]? = nil,
        repliedTo: Identifier?? = nil,
        editedAt: Date?? = nil
    ) -> Message {
        Message(
            id: id ?? self.id,
            localID: localID ?? self.localID,
            authorID: authorID ?? self.authorID,
            authorName: authorName ?? self.authorName,
            kind: kind ?? self.kind,
            text: text ?? self.text,
            mediaID: mediaID ?? self.mediaID,
            createdAt: createdAt ?? self.createdAt,
            status: status ?? self.status,
            attachments: attachments ?? self.attachments,
            repliedTo: repliedTo ?? self.repliedTo,
            editedAt: editedAt ?? self.editedAt
        )
    }

    public var primaryImageURL: URL? {
        attachments.first(where: { $0.kind == .image })?.url
    }
}
