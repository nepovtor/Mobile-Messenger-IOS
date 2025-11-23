import Foundation

public struct MessageAttachment: Identifiable, Hashable, Codable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case image
        case video
        case file
        case audio
    }

    public let id: UUID
    public let kind: Kind
    public let url: URL?
    public let localPath: URL?
    public let thumbnailURL: URL?
    public let fileSize: Int64?

    public init(
        id: UUID = UUID(),
        kind: Kind,
        url: URL?,
        localPath: URL?,
        thumbnailURL: URL? = nil,
        fileSize: Int64? = nil
    ) {
        self.id = id
        self.kind = kind
        self.url = url
        self.localPath = localPath
        self.thumbnailURL = thumbnailURL
        self.fileSize = fileSize
    }
}
