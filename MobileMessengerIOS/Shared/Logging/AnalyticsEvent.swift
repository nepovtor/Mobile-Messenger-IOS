import Foundation

public struct AnalyticsEvent: Sendable, Codable, Equatable {
    public enum Kind: String, Codable, Sendable {
        case error
        case messageSent
        case pushRegistered
        // Add more cases as needed, e.g., screenView, buttonTap, etc.
    }

    public let kind: Kind
    public let metadata: [String: String]
    public let timestamp: Date

    public init(kind: Kind, metadata: [String: String] = [:], timestamp: Date = Date()) {
        self.kind = kind
        self.metadata = metadata
        self.timestamp = timestamp
    }
}
