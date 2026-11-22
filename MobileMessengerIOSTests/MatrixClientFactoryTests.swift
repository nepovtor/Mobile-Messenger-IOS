import MatrixRustSDK
import XCTest
@testable import MobileMessengerIOS

final class MatrixClientFactoryTests: XCTestCase {
    func testNativeAttachmentRejectsPlainMediaEvenInsideEncryptedMessage() throws {
        let plain = try MediaSource.fromUrl(url: "mxc://matrix.example/media")
        XCTAssertNil(NativeMatrixAttachment(source: plain, mimetype: "image/png", size: 100, image: true))
    }

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
    func testNativeConfigurationRejectsForeignOwnerAndCredentialURLs() throws {
        let owner = UUID()
        let ownID = "@u_\(owner.uuidString.replacingOccurrences(of: "-", with: "").lowercased()):matrix.example"
        let valid = NativeMatrixConfig(homeserverURL: URL(string: "https://matrix.example")!, issuerURL: URL(string: "https://auth.example")!, serverName: "matrix.example", expectedUserID: ownID)
        XCTAssertNoThrow(try valid.validate(owner: owner))
        XCTAssertThrowsError(try valid.validate(owner: UUID()))
        let hostile = NativeMatrixConfig(homeserverURL: URL(string: "https://token@matrix.example/path")!, issuerURL: valid.issuerURL, serverName: valid.serverName, expectedUserID: ownID)
        XCTAssertThrowsError(try hostile.validate(owner: owner))
    }

    func testNativeDescriptorRejectsStaleEpochAndForeignParticipants() {
        let chatID = UUID()
        let owner = UUID()
        let ownID = "@owner:matrix.example"
        let participant = NativeMatrixDescriptor.Participant(userID: owner, matrixUserID: ownID, displayName: "Owner", active: true)
        let stale = NativeMatrixDescriptor(chatID: chatID, roomID: "!room:matrix.example", epoch: 2, boundEpoch: 1, participants: [participant])
        XCTAssertThrowsError(try stale.validate(chatID: chatID, owner: ownID))
        let foreign = NativeMatrixDescriptor(chatID: chatID, roomID: nil, epoch: 1, boundEpoch: nil, participants: [participant])
        XCTAssertThrowsError(try foreign.validate(chatID: UUID(), owner: ownID))
        XCTAssertThrowsError(try foreign.validate(chatID: chatID, owner: "@other:matrix.example"))
    }

    func testClosedNativeSessionCannotReplaceNewlyRefreshedCredentials() throws {
        let owner = UUID()
        let config = NativeMatrixConfig(homeserverURL: URL(string: "https://matrix.example")!, issuerURL: URL(string: "https://auth.example")!, serverName: "matrix.example", expectedUserID: "@u_\(owner.uuidString.replacingOccurrences(of: "-", with: "").lowercased()):matrix.example")
        let old = try MatrixSessionKeychain(config: config, onFailure: {})
        try old.save(.init(accessToken: "old-token", refreshToken: "old-refresh", userId: config.expectedUserID, deviceId: old.deviceID, homeserverUrl: config.homeserverURL.absoluteString, oauthData: nil, slidingSyncVersion: .none))
        let delayed = try old.retrieveSessionFromKeychain(userId: config.expectedUserID)
        old.close()
        let next = try MatrixSessionKeychain(config: config, onFailure: {})
        defer { try? next.remove() }
        try next.save(.init(accessToken: "new-token", refreshToken: "new-refresh", userId: config.expectedUserID, deviceId: next.deviceID, homeserverUrl: config.homeserverURL.absoluteString, oauthData: nil, slidingSyncVersion: .none))
        XCTAssertThrowsError(try old.save(delayed))
        XCTAssertEqual(try next.retrieveSessionFromKeychain(userId: config.expectedUserID).accessToken, "new-token")
    }

    func testStaleDeviceCannotRemoveReplacementCredentials() throws {
        let owner = UUID()
        let config = NativeMatrixConfig(homeserverURL: URL(string: "https://matrix.example")!, issuerURL: URL(string: "https://auth.example")!, serverName: "matrix.example", expectedUserID: "@u_\(owner.uuidString.replacingOccurrences(of: "-", with: "").lowercased()):matrix.example")
        let old = try MatrixSessionKeychain(config: config, onFailure: {})
        try old.save(.init(accessToken: "old", refreshToken: nil, userId: config.expectedUserID, deviceId: old.deviceID, homeserverUrl: config.homeserverURL.absoluteString, oauthData: nil, slidingSyncVersion: .none))
        try MatrixSessionKeychain(config: config, onFailure: {}).remove()
        let next = try MatrixSessionKeychain(config: config, onFailure: {})
        defer { try? next.remove() }
        try next.save(.init(accessToken: "new", refreshToken: nil, userId: config.expectedUserID, deviceId: next.deviceID, homeserverUrl: config.homeserverURL.absoluteString, oauthData: nil, slidingSyncVersion: .none))
        XCTAssertThrowsError(try old.remove())
        XCTAssertEqual(try next.retrieveSessionFromKeychain(userId: config.expectedUserID).accessToken, "new")
        old.close()
    }

}
