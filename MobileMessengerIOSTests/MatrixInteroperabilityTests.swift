import Foundation
import MatrixRustSDK
import XCTest
@testable import MobileMessengerIOS

/// Runs only against the private loopback TLS fixture created by run-matrix-interop.py.
/// The fixture independently checks receipt and ciphertext on the JavaScript side.
@MainActor
final class MatrixInteroperabilityTests: XCTestCase {
    private struct Manifest: Decodable { let controlURL: URL; let controlToken: String; let certificateFile: String }
    private struct Credentials: Decodable {
        let access_token: String
        let user_id: String
        let device_id: String
    }
    private struct Configuration: Decodable {
        let homeserver: URL
        let native: Credentials
        let recovery: String
        let roomID: String
        let markers: [String: String]
    }
    private struct Ready: Decodable { let corruptID: String; let sessionID: String; let webEventID: String }
    private struct Fresh: Decodable { let native: Credentials }
    private struct Receipt: Decodable { let received: Bool }
    private struct Complete: Decodable { let completed: Bool }

    private final class Observer: TimelineListener, @unchecked Sendable {
        let callback: @Sendable ([TimelineDiff]) -> Void
        init(_ callback: @escaping @Sendable ([TimelineDiff]) -> Void) { self.callback = callback }
        func onUpdate(diff: [TimelineDiff]) { callback(diff) }
    }
    private final class Events {
        var items: [TimelineItem] = []
        func update(_ differences: [TimelineDiff]) {
            for difference in differences {
                switch difference {
                case .append(let values): items += values
                case .clear: items = []
                case .pushFront(let value): items.insert(value, at: 0)
                case .pushBack(let value): items.append(value)
                case .popFront: if !items.isEmpty { items.removeFirst() }
                case .popBack: _ = items.popLast()
                case .insert(let index, let value): items.insert(value, at: Int(index))
                case .set(let index, let value): items[Int(index)] = value
                case .remove(let index): items.remove(at: Int(index))
                case .truncate(let length): items = Array(items.prefix(Int(length)))
                case .reset(let values): items = values
                }
            }
        }
        var events: [EventTimelineItem] { items.compactMap { $0.asEvent() } }
        func containing(_ body: String) -> [EventTimelineItem] {
            events.filter {
                guard case .msgLike(let content) = $0.content, case .message(let message) = content.kind else { return false }
                return message.body == body
            }
        }
        func cannotDecrypt(_ id: String) -> Bool {
            events.contains {
                guard case .eventId(let eventID) = $0.eventOrTransactionId, eventID == id,
                      case .msgLike(let content) = $0.content, case .unableToDecrypt = content.kind else { return false }
                return true
            }
        }
    }

    private func control<T: Decodable>(_ path: String, manifest: Manifest) async throws -> T {
        guard manifest.controlURL.scheme == "http", manifest.controlURL.host == "127.0.0.1", manifest.controlURL.port != nil else {
            throw MatrixWorkspaceError.invalidConfiguration
        }
        var request = URLRequest(url: manifest.controlURL.appendingPathComponent(path))
        request.timeoutInterval = 60
        request.setValue("Bearer \(manifest.controlToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "MatrixInterop", code: 1, userInfo: [NSLocalizedDescriptionKey: "Fixture failed at \(path)"])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func wait(_ description: String, until condition: () async throws -> Bool) async throws {
        let deadline = Date().addingTimeInterval(50)
        while Date() < deadline {
            if try await condition() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail(description)
        throw NSError(domain: "MatrixInterop", code: 2, userInfo: [NSLocalizedDescriptionKey: description])
    }

    private func open(_ credentials: Credentials, config: Configuration, manifest: Manifest) async throws -> (Client, SyncService) {
        guard config.homeserver.scheme == "https", config.homeserver.host == "localhost", config.homeserver.port != nil else {
            throw MatrixWorkspaceError.invalidConfiguration
        }
        let certificate = try Data(contentsOf: URL(fileURLWithPath: manifest.certificateFile))
        let client = try await MatrixClientFactory().makeClient(homeserverURL: config.homeserver,
            userID: credentials.user_id, deviceID: credentials.device_id, trustedRootCertificates: [certificate])
        try await client.restoreSession(session: Session(accessToken: credentials.access_token, refreshToken: nil,
            userId: credentials.user_id, deviceId: credentials.device_id, homeserverUrl: config.homeserver.absoluteString,
            oauthData: nil, slidingSyncVersion: .native))
        let sync = try await client.syncService().withOfflineMode().finish()
        await sync.start()
        try await wait("Native room did not synchronize") { try client.getRoom(roomId: config.roomID) != nil }
        return (client, sync)
    }

    func testRealJavaScriptSwiftExchangeRestartAndRecovery() async throws {
        guard let path = ProcessInfo.processInfo.environment["MATRIX_INTEROP_MANIFEST"], !path.isEmpty, !path.contains("$(") else {
            throw XCTSkip("Dedicated loopback fixture required; the interop CI job must execute this test")
        }
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        let config: Configuration = try await control("config", manifest: manifest)
        var active = try await open(config.native, config: config, manifest: manifest)
        try await active.0.encryption().recover(recoveryKey: config.recovery)
        try await wait("Recovery must restore and verify the existing identity") { active.0.encryption().verificationState() == .verified }
        var room = try XCTUnwrap(try active.0.getRoom(roomId: config.roomID))
        let encrypted = await room.isEncrypted()
        XCTAssertTrue(encrypted)
        var timeline = try await room.timeline()
        var events = Events()
        var observer = Observer { [weak events] differences in Task { @MainActor in events?.update(differences) } }
        var handle = await timeline.addListener(listener: observer)
        let expected: Ready = try await control("ready", manifest: manifest)
        try await wait("Swift did not decrypt every reordered/retried Web message") {
            ["web", "retry", "first", "second"].allSatisfy { events.containing(config.markers[$0]!).count == 1 }
                && events.cannotDecrypt(expected.corruptID)
        }
        let content = try XCTUnwrap(timeline.createMessageContent(msgType: .text(content: TextMessageContent(body: config.markers["native"]!, formatted: nil))))
        _ = try await timeline.send(msg: content)
        let receipt: Receipt = try await control("received", manifest: manifest)
        XCTAssertTrue(receipt.received, "The JS peer must decrypt a ciphertext-only native event")
        // Stop synchronization and reopen the same encrypted SQLite store/device.
        handle.cancel()
        await active.1.stop()
        // The SDK supports multiple process holders and serializes access to the same crypto store.
        active = try await open(config.native, config: config, manifest: manifest)
        room = try XCTUnwrap(try active.0.getRoom(roomId: config.roomID))
        timeline = try await room.timeline()
        events = Events()
        observer = Observer { [weak events] differences in Task { @MainActor in events?.update(differences) } }
        handle = await timeline.addListener(listener: observer)
        _ = try await timeline.paginateBackwards(numEvents: 100)
        try await wait("The reopened device did not restore its encrypted history") {
            events.containing(config.markers["web"]!).count == 1 && events.containing(config.markers["native"]!).count == 1
        }
        handle.cancel(); await active.1.stop()
        // A new device has no original crypto store and must recover the old history from backup.
        let fresh: Fresh = try await control("fresh", manifest: manifest)
        active = try await open(fresh.native, config: config, manifest: manifest)
        room = try XCTUnwrap(try active.0.getRoom(roomId: config.roomID))
        timeline = try await room.timeline(); events = Events()
        observer = Observer { [weak events] differences in Task { @MainActor in events?.update(differences) } }
        handle = await timeline.addListener(listener: observer)
        _ = try await timeline.paginateBackwards(numEvents: 100)
        try await wait("A new unsigned device must not obtain old room keys automatically") { events.cannotDecrypt(expected.webEventID) }
        try await active.0.encryption().recover(recoveryKey: config.recovery)
        timeline.retryDecryption(sessionIds: [expected.sessionID])
        _ = try await timeline.paginateBackwards(numEvents: 100)
        try await wait("A fresh device could not recover pre-existing history") { events.containing(config.markers["web"]!).count == 1 && events.containing(config.markers["native"]!).count == 1 }
        let result: Complete = try await control("complete", manifest: manifest)
        XCTAssertTrue(result.completed)
        handle.cancel(); await active.1.stop()
    }
}
