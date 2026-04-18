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
#if DEBUG
        return URL(string: "https://mobile-messenger-ios-production.up.railway.app/api")!
#else
        if let url = urlFromInfoDictionary(key: "REST_BASE_URL") {
            return url
        }
        return URL(string: "https://api.example.com")!
#endif
    }

    public var websocketURL: URL {
#if DEBUG
        return URL(string: "wss://mobile-messenger-ios-production.up.railway.app")!
#else
        if let url = urlFromInfoDictionary(key: "WEBSOCKET_URL") {
            return url
        }
        return URL(string: "wss://ws.example.com")!
#endif
    }

    private func urlFromInfoDictionary(key: String) -> URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
            return nil
        }

        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleaned = trimmed.replacingOccurrences(of: "\\", with: "")
        return URL(string: cleaned)
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
