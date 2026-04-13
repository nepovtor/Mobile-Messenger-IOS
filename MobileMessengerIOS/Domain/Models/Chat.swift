import Foundation

public struct Chat: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let title: String
    public let lastMessagePreview: String?
    public let lastActivity: Date
    public let unreadCount: Int
    public let typingParticipants: [String]
    public let participantNames: [String]
    public let participantCount: Int

    public init(
        id: UUID,
        title: String,
        lastMessagePreview: String?,
        lastActivity: Date,
        unreadCount: Int,
        typingParticipants: [String] = [],
        participantNames: [String] = [],
        participantCount: Int = 1
    ) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
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
