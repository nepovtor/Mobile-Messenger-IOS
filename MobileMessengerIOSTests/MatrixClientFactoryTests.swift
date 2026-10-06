import XCTest
@testable import MobileMessengerIOS

final class MatrixClientFactoryTests: XCTestCase {
    func testRejectsInsecureHomeserverBeforeCreatingStore() async {
        let factory = MatrixClientFactory()
        do {
            _ = try await factory.makeClient(
                homeserverURL: URL(string: "http://example.com")!,
                userID: "@alice:example.com",
                deviceID: "IOS1"
            )
            XCTFail("Insecure Matrix homeserver must be rejected")
        } catch MatrixClientFactory.StoreError.invalidHomeserver {
            // Expected: plaintext transport cannot be used for Matrix login.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
