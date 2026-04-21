import XCTest
@testable import MobileMessengerIOS

final class MobileMessengerIOSTests: XCTestCase {
    func testServerChatDecodesFractionalSecondTimestamp() throws {
        let payload = """
        {
          "id": "11111111-1111-1111-1111-111111111111",
          "title": "General Chat",
          "lastMessagePreview": null,
          "lastActivity": "2026-04-18T20:44:53.671Z",
          "unreadCount": 0,
          "typingParticipants": [],
          "participantNames": [],
          "participantCount": 1
        }
        """.data(using: .utf8)!

        let service = RESTChatService(
            baseURL: URL(string: "http://localhost/api")!,
            authTokenProvider: { nil }
        )
        let mirror = Mirror(reflecting: service)
        let decoder = try XCTUnwrap(mirror.descendant("decoder") as? JSONDecoder)

        let chat = try decoder.decode(ServerChat.self, from: payload)

        XCTAssertEqual(chat.title, "General Chat")
        XCTAssertEqual(chat.unreadCount, 0)
    }

    @MainActor
    func testChatPresentationStorePersistsDrafts() {
        let defaults = UserDefaults(suiteName: "MobileMessengerIOSTests.\(UUID().uuidString)")!
        let chatID = UUID()

        let store = ChatPresentationStore(defaults: defaults)
        store.updateDraft("Черновик", for: chatID)

        let restoredStore = ChatPresentationStore(defaults: defaults)
        XCTAssertEqual(restoredStore.state(for: chatID).draft, "Черновик")
    }

    @MainActor
    func testConfigServiceProvidesURLs() {
        let config = DefaultConfigService()

        XCTAssertFalse(config.restBaseURL.absoluteString.isEmpty)
        XCTAssertFalse(config.websocketURL.absoluteString.isEmpty)
    }
}
