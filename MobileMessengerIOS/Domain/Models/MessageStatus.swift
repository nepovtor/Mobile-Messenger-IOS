import Foundation

public enum MessageDeliveryState: String, Codable, CaseIterable, Sendable {
    case sending
    case sent
    case failed
}

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

    public var deliveryState: MessageDeliveryState {
        switch self {
        case .sending:
            return .sending
        case .failed:
            return .failed
        case .sent, .delivered, .read:
            return .sent
        }
    }
}
