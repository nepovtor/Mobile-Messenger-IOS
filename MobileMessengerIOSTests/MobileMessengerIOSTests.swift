import XCTest
@testable import MobileMessengerIOS

final class MobileMessengerIOSTests: XCTestCase {
    func testLanguagePreferenceChoosesExpectedCopy() {
        XCTAssertEqual(AppLanguagePreference.russian.text(ru: "Чаты", en: "Chats"), "Чаты")
        XCTAssertEqual(AppLanguagePreference.english.text(ru: "Чаты", en: "Chats"), "Chats")
    }

    func testConfigServiceProvidesURLs() {
        let config = DefaultConfigService()

        XCTAssertFalse(config.restBaseURL.absoluteString.isEmpty)
        XCTAssertFalse(config.websocketURL.absoluteString.isEmpty)
    }
}
