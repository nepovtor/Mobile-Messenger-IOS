import Foundation

public struct Chat: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public let title: String
    public let lastMessagePreview: String?
    public let lastMessageAuthorName: String?
    public let lastMessageIsOutgoing: Bool
    public let lastMessageStatus: MessageStatus?
    public let lastMessageKind: Message.Kind?
    public let lastActivity: Date
    public let unreadCount: Int
    public let typingParticipants: [String]
    public let participantNames: [String]
    public let participantCount: Int

    public init(
        id: UUID,
        title: String,
        lastMessagePreview: String?,
        lastMessageAuthorName: String? = nil,
        lastMessageIsOutgoing: Bool = false,
        lastMessageStatus: MessageStatus? = nil,
        lastMessageKind: Message.Kind? = nil,
        lastActivity: Date,
        unreadCount: Int,
        typingParticipants: [String] = [],
        participantNames: [String] = [],
        participantCount: Int = 1
    ) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageAuthorName = lastMessageAuthorName
        self.lastMessageIsOutgoing = lastMessageIsOutgoing
        self.lastMessageStatus = lastMessageStatus
        self.lastMessageKind = lastMessageKind
        self.lastActivity = lastActivity
        self.unreadCount = unreadCount
        self.typingParticipants = typingParticipants
        self.participantNames = participantNames
        self.participantCount = participantCount
    }

    public var isGroup: Bool {
        participantCount > 2
    }
}
