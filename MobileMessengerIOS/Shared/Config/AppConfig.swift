import Foundation
import Combine

@MainActor
public protocol ConfigService: AnyObject {
    var restBaseURL: URL { get }
    var defaultRESTBaseURL: URL { get }
    var websocketURL: URL { get }
    var telegramBotUsername: String? { get }
    var telegramBotURL: URL? { get }
    var features: FeatureFlags { get }
    var hasCustomRESTBaseURL: Bool { get }
    func updateRESTBaseURL(_ rawValue: String) throws
    func resetRESTBaseURL()
}

public struct FeatureFlags: Sendable {
    public let isRealtimeEnabled: Bool
    public let isPushEnabled: Bool
    public let isMediaEnabled: Bool
    public let isLoggingVerbose: Bool
}

public enum ConfigError: LocalizedError {
    case emptyRESTBaseURL
    case invalidRESTBaseURL(String)

    public var errorDescription: String? {
        switch self {
        case .emptyRESTBaseURL:
            return "Введите адрес backend, например https://api.example.com/api"
        case .invalidRESTBaseURL(let value):
            return "Некорректный адрес backend: \(value)"
        }
    }
}

@MainActor
public final class DefaultConfigService: ObservableObject, ConfigService {
    private enum Constants {
        static let restBaseURLOverrideKey = "debug.rest_base_url_override"
    }

    @Published public private(set) var restBaseURL: URL
    public let defaultRESTBaseURL: URL
    public let telegramBotUsername: String?
    public let features: FeatureFlags

    private let defaults: UserDefaults

    public init(bundle: Bundle = .main, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.defaultRESTBaseURL = Self.readRESTBaseURL(from: bundle)
        self.telegramBotUsername = Self.readTelegramBotUsername(from: bundle)
        self.features = Self.readFeatures(from: bundle)

        if let overrideValue = defaults.string(forKey: Constants.restBaseURLOverrideKey),
           let overrideURL = try? Self.normalizeRESTBaseURL(overrideValue) {
            self.restBaseURL = overrideURL
        } else {
            self.restBaseURL = self.defaultRESTBaseURL
        }
    }

    public var hasCustomRESTBaseURL: Bool {
        restBaseURL != defaultRESTBaseURL
    }

    public var websocketURL: URL {
        Self.makeWebSocketURL(from: restBaseURL)
    }

    public var telegramBotURL: URL? {
        guard let telegramBotUsername else { return nil }
        return URL(string: "https://t.me/\(telegramBotUsername)")
    }

    public func updateRESTBaseURL(_ rawValue: String) throws {
        let normalizedURL = try Self.normalizeRESTBaseURL(rawValue)
        restBaseURL = normalizedURL
        defaults.set(normalizedURL.absoluteString, forKey: Constants.restBaseURLOverrideKey)
    }

    public func resetRESTBaseURL() {
        defaults.removeObject(forKey: Constants.restBaseURLOverrideKey)
        restBaseURL = defaultRESTBaseURL
    }

    private static func readRESTBaseURL(from bundle: Bundle) -> URL {
        if let string = bundle.object(forInfoDictionaryKey: "REST_BASE_URL") as? String,
           let url = try? normalizeRESTBaseURL(string) {
            return url
        }

        return URL(string: "https://api.example.com/api")!
    }

    private static func readTelegramBotUsername(from bundle: Bundle) -> String? {
        guard let value = bundle.object(forInfoDictionaryKey: "TELEGRAM_BOT_USERNAME") as? String else {
            return nil
        }

        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "@", with: "")
        return normalized.isEmpty ? nil : normalized
    }

    private static func readFeatures(from bundle: Bundle) -> FeatureFlags {
        FeatureFlags(
            isRealtimeEnabled: readBool(from: bundle, key: "FEATURE_REALTIME", default: true),
            isPushEnabled: readBool(from: bundle, key: "FEATURE_PUSH", default: true),
            isMediaEnabled: readBool(from: bundle, key: "FEATURE_MEDIA", default: false),
            isLoggingVerbose: readBool(from: bundle, key: "FEATURE_VERBOSE_LOGGING", default: false)
        )
    }

    private static func readBool(from bundle: Bundle, key: String, default defaultValue: Bool) -> Bool {
        if let value = bundle.object(forInfoDictionaryKey: key) as? String {
            return (value as NSString).boolValue
        }
        if let value = bundle.object(forInfoDictionaryKey: key) as? Bool {
            return value
        }
        return defaultValue
    }

    private static func normalizeRESTBaseURL(_ rawValue: String) throws -> URL {
        let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedValue.isEmpty else {
            throw ConfigError.emptyRESTBaseURL
        }

        let candidateValue: String
        if trimmedValue.contains("://") {
            candidateValue = trimmedValue
        } else {
            candidateValue = "http://\(trimmedValue)"
        }

        guard var components = URLComponents(string: candidateValue),
              let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              components.host != nil else {
            throw ConfigError.invalidRESTBaseURL(trimmedValue)
        }

        components.scheme = scheme
        components.query = nil
        components.fragment = nil

        let normalizedPath = components.path
            .split(separator: "/")
            .map(String.init)
        if normalizedPath.isEmpty {
            components.path = "/api"
        } else {
            components.path = "/" + normalizedPath.joined(separator: "/")
        }

        guard let url = components.url else {
            throw ConfigError.invalidRESTBaseURL(trimmedValue)
        }

        return url
    }

    private static func makeWebSocketURL(from restBaseURL: URL) -> URL {
        guard var components = URLComponents(url: restBaseURL, resolvingAgainstBaseURL: false) else {
            return URL(string: "wss://ws.example.com/realtime")!
        }

        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.query = nil
        components.fragment = nil
        components.path = "/realtime"

        return components.url ?? URL(string: "wss://ws.example.com/realtime")!
    }
}
