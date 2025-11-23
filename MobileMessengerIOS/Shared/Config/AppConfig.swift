import Foundation

public protocol ConfigService {
    var restBaseURL: URL { get }
    var websocketURL: URL { get }
    var features: FeatureFlags { get }
}

public struct FeatureFlags: Sendable {
    public let isRealtimeEnabled: Bool
    public let isPushEnabled: Bool
    public let isMediaEnabled: Bool
    public let isLoggingVerbose: Bool
}

public struct DefaultConfigService: ConfigService {
    public init() {}

    public var restBaseURL: URL {
        guard let string = Bundle.main.object(forInfoDictionaryKey: "REST_BASE_URL") as? String,
              let url = URL(string: string) else {
            return URL(string: "https://api.example.com")!
        }
        return url
    }

    public var websocketURL: URL {
        guard let string = Bundle.main.object(forInfoDictionaryKey: "WEBSOCKET_URL") as? String,
              let url = URL(string: string) else {
            return URL(string: "wss://ws.example.com")!
        }
        return url
    }

    public var features: FeatureFlags {
        FeatureFlags(
            isRealtimeEnabled: readBool(key: "FEATURE_REALTIME", default: true),
            isPushEnabled: readBool(key: "FEATURE_PUSH", default: true),
            isMediaEnabled: readBool(key: "FEATURE_MEDIA", default: false),
            isLoggingVerbose: readBool(key: "FEATURE_VERBOSE_LOGGING", default: false)
        )
    }

    private func readBool(key: String, default defaultValue: Bool) -> Bool {
        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String {
            return (value as NSString).boolValue
        }
        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? Bool {
            return value
        }
        return defaultValue
    }
}
