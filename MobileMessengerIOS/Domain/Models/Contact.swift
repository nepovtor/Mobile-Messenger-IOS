import Foundation

public struct Contact: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let userID: UUID
    public let displayName: String
    public let phone: String
    public let createdAt: String
    public let directChatID: UUID?
    public let alreadyExists: Bool?

    public init(
        id: UUID,
        userID: UUID,
        displayName: String,
        phone: String,
        createdAt: String,
        directChatID: UUID?,
        alreadyExists: Bool? = nil
    ) {
        self.id = id
        self.userID = userID
        self.displayName = displayName
        self.phone = phone
        self.createdAt = createdAt
        self.directChatID = directChatID
        self.alreadyExists = alreadyExists
    }

    public var subtitle: String {
        phone
    }
}

extension Contact {
    init(dto: ContactDTO) {
        self.init(
            id: dto.id,
            userID: dto.userID,
            displayName: dto.displayName,
            phone: dto.phone,
            createdAt: dto.createdAt,
            directChatID: dto.directChatID,
            alreadyExists: dto.alreadyExists
        )
    }
}
