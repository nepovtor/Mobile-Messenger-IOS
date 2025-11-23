import Foundation

public enum MessageStatus: String, Codable, CaseIterable, Sendable {
    case sending
    case sent
    case delivered
    case read
    case failed

    public var isTerminal: Bool {
        switch self {
        case .read, .failed:
            return true
        case .sending, .sent, .delivered:
            return false
        }
    }
}
