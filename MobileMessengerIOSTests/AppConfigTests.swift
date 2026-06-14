import XCTest
@testable import MobileMessengerIOS

@MainActor
final class AppConfigTests: XCTestCase {
    private let restBaseURLOverrideKey = "debug.rest_base_url_override"
    private let productionRESTBaseURL = "https://phpstack-1634854-6489525.cloudwaysapps.com/api"
    private let productionWebSocketURL = "wss://phpstack-1634854-6489525.cloudwaysapps.com/realtime"

    func testPlaceholderBundledRESTBaseURLFallsBackToProductionBackend() throws {
        let temporaryBundle = try makeBundle(
            infoDictionary: [
                "REST_BASE_URL": "https://api.example.com/api",
                "TELEGRAM_BOT_USERNAME": ""
            ]
        )
        defer { temporaryBundle.cleanup() }

        let defaults = makeIsolatedDefaults()
        let configService = DefaultConfigService(bundle: temporaryBundle.bundle, defaults: defaults)

        XCTAssertEqual(configService.defaultRESTBaseURL.absoluteString, productionRESTBaseURL)
        XCTAssertEqual(configService.restBaseURL.absoluteString, productionRESTBaseURL)
        XCTAssertEqual(configService.websocketURL.absoluteString, productionWebSocketURL)
        XCTAssertEqual(configService.telegramBotUsername, "verificMobileMessengerIOSbot")
        XCTAssertFalse(configService.hasCustomRESTBaseURL)
    }

    func testPlaceholderPersistedOverrideIsIgnoredAndRemoved() throws {
        let temporaryBundle = try makeBundle(
            infoDictionary: [
                "REST_BASE_URL": productionRESTBaseURL
            ]
        )
        defer { temporaryBundle.cleanup() }

        let defaults = makeIsolatedDefaults()
        defaults.set("https://api.staging.example.com/api", forKey: restBaseURLOverrideKey)

        let configService = DefaultConfigService(bundle: temporaryBundle.bundle, defaults: defaults)

        XCTAssertEqual(configService.restBaseURL.absoluteString, productionRESTBaseURL)
        XCTAssertNil(defaults.string(forKey: restBaseURLOverrideKey))
        XCTAssertFalse(configService.hasCustomRESTBaseURL)
    }

    func testUpdateRESTBaseURLRejectsPlaceholderHosts() throws {
        let temporaryBundle = try makeBundle(
            infoDictionary: [
                "REST_BASE_URL": productionRESTBaseURL
            ]
        )
        defer { temporaryBundle.cleanup() }

        let defaults = makeIsolatedDefaults()
        let configService = DefaultConfigService(bundle: temporaryBundle.bundle, defaults: defaults)

        XCTAssertThrowsError(try configService.updateRESTBaseURL("https://api.example.com/api")) { error in
            XCTAssertEqual(
                error.localizedDescription,
                "Некорректный адрес backend: https://api.example.com/api"
            )
        }

        XCTAssertEqual(configService.restBaseURL.absoluteString, productionRESTBaseURL)
        XCTAssertNil(defaults.string(forKey: restBaseURLOverrideKey))
    }

    func testCustomRESTBaseURLUpdatesRealtimeURL() throws {
        let temporaryBundle = try makeBundle(
            infoDictionary: [
                "REST_BASE_URL": productionRESTBaseURL
            ]
        )
        defer { temporaryBundle.cleanup() }

        let defaults = makeIsolatedDefaults()
        let configService = DefaultConfigService(bundle: temporaryBundle.bundle, defaults: defaults)

        try configService.updateRESTBaseURL("https://chat.internal.test/custom-api")

        XCTAssertEqual(configService.restBaseURL.absoluteString, "https://chat.internal.test/custom-api")
        XCTAssertEqual(configService.websocketURL.absoluteString, "wss://chat.internal.test/realtime")
        XCTAssertEqual(defaults.string(forKey: restBaseURLOverrideKey), "https://chat.internal.test/custom-api")
        XCTAssertTrue(configService.hasCustomRESTBaseURL)
    }

    private func makeIsolatedDefaults() -> UserDefaults {
        let suiteName = "AppConfigTests.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            fatalError("Failed to create isolated UserDefaults suite")
        }
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }

    private func makeBundle(infoDictionary: [String: Any]) throws -> TemporaryBundle {
        let fileManager = FileManager.default
        let bundleURL = fileManager.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("bundle")

        try fileManager.createDirectory(at: bundleURL, withIntermediateDirectories: true)

        let mergedInfoDictionary = infoDictionary.merging(
            [
                "CFBundleIdentifier": "com.mobilemessenger.tests.\(UUID().uuidString)",
                "CFBundleName": "AppConfigTests"
            ],
            uniquingKeysWith: { current, _ in current }
        )

        let plistURL = bundleURL.appendingPathComponent("Info.plist")
        let plistData = try PropertyListSerialization.data(
            fromPropertyList: mergedInfoDictionary,
            format: .xml,
            options: 0
        )
        try plistData.write(to: plistURL)

        guard let bundle = Bundle(url: bundleURL) else {
            throw TestError.bundleCreationFailed(bundleURL.path)
        }

        return TemporaryBundle(
            bundle: bundle,
            cleanup: {
                try? fileManager.removeItem(at: bundleURL)
            }
        )
    }
}

private struct TemporaryBundle {
    let bundle: Bundle
    let cleanup: () -> Void
}

private enum TestError: LocalizedError {
    case bundleCreationFailed(String)

    var errorDescription: String? {
        switch self {
        case .bundleCreationFailed(let path):
            return "Не удалось создать временный bundle по пути \(path)"
        }
    }
}
