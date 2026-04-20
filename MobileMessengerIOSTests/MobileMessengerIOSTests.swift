import XCTest
@testable import MobileMessengerIOS

final class MobileMessengerIOSTests: XCTestCase {
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
