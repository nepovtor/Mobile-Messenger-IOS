import Foundation
import Combine

@MainActor
public protocol ConfigService: AnyObject {
    var restBaseURL: URL { get }
    var defaultRESTBaseURL: URL { get }
    var websocketURL: URL { get }
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
    public let websocketURL: URL
    public let features: FeatureFlags

    private let defaults: UserDefaults

    public init(bundle: Bundle = .main, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.defaultRESTBaseURL = Self.readRESTBaseURL(from: bundle)
        self.websocketURL = Self.readURL(
            from: bundle,
            key: "WEBSOCKET_URL",
            fallback: "wss://mobile-messenger-ios-production.up.railway.app"
        )
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

        return URL(string: "https://mobile-messenger-ios-production.up.railway.app/api")!
    }

    private static func readURL(from bundle: Bundle, key: String, fallback: String) -> URL {
        guard let string = bundle.object(forInfoDictionaryKey: key) as? String,
              let url = URL(string: string) else {
            return URL(string: fallback)!
        }
        return url
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
}
