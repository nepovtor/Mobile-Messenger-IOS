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

    func testServerDateDecoderSupportsFractionalSeconds() throws {
        let payload = """
        {
          "id": "4862ee69-39ae-437d-acbd-9e347a54560f",
          "title": "Борис Demo",
          "lastMessagePreview": null,
          "lastActivity": "2026-04-09T12:43:43.086Z",
          "unreadCount": 0,
          "typingParticipants": []
        }
        """.data(using: .utf8)!

        let chat = try AppJSONDecoderFactory.makeJSONDecoder().decode(ChatDTO.self, from: payload)

        XCTAssertEqual(chat.id, UUID(uuidString: "4862ee69-39ae-437d-acbd-9e347a54560f"))
        XCTAssertEqual(chat.title, "Борис Demo")
        XCTAssertEqual(chat.unreadCount, 0)
    }
}
