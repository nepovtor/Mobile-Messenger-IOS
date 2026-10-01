// AnalyticsService.swift
// Centralized analytics protocol and default implementation
import Foundation

public protocol AnalyticsService: Sendable {
    func track(event: AppAnalyticsEvent)
    func track(error: Error, context: String)
}

// Use a unique, explicit type name to avoid ambiguity with any other AnalyticsEvent in the project.
public struct AppAnalyticsEvent: Sendable {
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
    private var events: [AppAnalyticsEvent] = []

    private init() {}

    // Convenience overloads to reduce ambiguity at call sites
    public func track(_ kind: AppAnalyticsEvent.Kind, metadata: [String: String] = [:], timestamp: Date = Date()) {
        track(event: AppAnalyticsEvent(kind: kind, metadata: metadata, timestamp: timestamp))
    }

    public func track(event: AppAnalyticsEvent) {
        queue.async { [weak self] in
            self?.events.append(event)
            #if DEBUG
            print("[Analytics] \(event.kind.rawValue)")
            #endif
        }
    }

    public func track(error: Error, context: String) {
        queue.async { [weak self] in
            let category = Self.errorCategory(error)
            let event = AppAnalyticsEvent(
                kind: .networkError,
                metadata: ["context": context, "category": category]
            )
            self?.events.append(event)
            #if DEBUG
            print("[Analytics][Error] \(context): \(category)")
            #endif
        }
    }

    private static func errorCategory(_ error: Error) -> String {
        if let parseError = error as? APIResponseParser.ParseError {
            if let statusCode = parseError.statusCode {
                return "http_\(statusCode)"
            }
            return "api_transport"
        }

        if let urlError = error as? URLError {
            return "url_\(urlError.code.rawValue)"
        }

        return "unexpected"
    }
}
