import Foundation

public protocol AnalyticsService: Sendable {
    func track(event: AnalyticsEvent)
    func track(error: Error, context: String)
}

public extension AnalyticsService {
    func track(_ kind: AnalyticsEvent.Kind, metadata: [String: String] = [:]) {
        track(event: AnalyticsEvent(kind: kind, metadata: metadata))
    }
}

public struct AnalyticsEvent: Sendable {
    public enum Kind: String, Sendable {
        case chatOpened
        case messageSent
        case messageReceived
        case networkError
        case storageError
        case pushRegistered
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

public final class DefaultAnalyticsService: AnalyticsService, @unchecked Sendable {
    public static let shared = DefaultAnalyticsService()
    private let queue = DispatchQueue(label: "analytics.queue", qos: .utility)
    private var events: [AnalyticsEvent] = [] // Protected by DispatchQueue

    private init() {}

    public func track(event: AnalyticsEvent) {
        queue.async { [weak self] in
            self?.events.append(event)
            #if DEBUG
            print("[Analytics] \(event.kind.rawValue): \(event.metadata)")
            #endif
        }
    }

    public func track(error: Error, context: String) {
        queue.async { [weak self] in
            let event = AnalyticsEvent(kind: .networkError, metadata: ["context": context, "description": String(describing: error)])
            self?.events.append(event)
            #if DEBUG
            print("[Analytics][Error] \(context): \(error.localizedDescription)")
            #endif
        }
    }
}
