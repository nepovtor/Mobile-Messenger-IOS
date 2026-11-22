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
    private struct Requested: Decodable { let requested: Bool }
    private struct Sas: Decodable { let emoji: [String]; let decimal: [UInt16] }
    private struct Verified: Decodable { let verified: Bool }
    private struct Fresh: Decodable { let native: Credentials }
    private struct Receipt: Decodable { let received: Bool }
    private struct FirstReady: Decodable { let ready: Bool }
    private final class RecoveryProgress: EnableRecoveryProgressListener, @unchecked Sendable { func onUpdate(status: EnableRecoveryProgress) {} }
    private struct GroupScenario: Decodable { let roomID: String; let before: String; let after: String; let native: String }
    private struct Attachments: Decodable {
        let imageID: String; let audioID: String; let corruptID: String
        let imageBytesBase64: String; let audioBytesBase64: String
    }
    private struct Complete: Decodable { let completed: Bool }

    private final class SyncObserver: SyncServiceStateObserver, @unchecked Sendable {
        func onUpdate(state: SyncServiceState) { print("MatrixInterop sync: \(state)") }
    }
    private var syncStateHandles: [TaskHandle] = []
    private final class FixtureSessionDelegate: ClientSessionDelegate, @unchecked Sendable {
        private let mutex = NSLock()
        private var session: Session
        init(_ session: Session) { self.session = session }
        func retrieveSessionFromKeychain(userId: String) throws -> Session {
            mutex.lock(); defer { mutex.unlock() }
            guard userId == session.userId else { throw MatrixWorkspaceError.sessionClosed }
            return session
        }
        func saveSessionInKeychain(session: Session) {
            mutex.lock(); defer { mutex.unlock() }
            guard session.userId == self.session.userId, session.deviceId == self.session.deviceId else { return }
            self.session = session
        }
    }
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
        func attachment(_ id: String) -> NativeMatrixAttachment? {
            guard let event = events.first(where: { if case .eventId(let value) = $0.eventOrTransactionId { return value == id }; return false }),
                  case .msgLike(let content) = event.content, case .message(let message) = content.kind else { return nil }
            switch message.msgType {
            case .image(let media): return NativeMatrixAttachment(source: media.source, mimetype: media.info?.mimetype, size: media.info?.size, image: true)
            case .audio(let media): return NativeMatrixAttachment(source: media.source, mimetype: media.info?.mimetype, size: media.info?.size, image: false)
            default: return nil
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

    private func open(_ credentials: Credentials, config: Configuration, manifest: Manifest, waitForRoom: Bool = true) async throws -> (Client, SyncService, RoomListEntriesWithDynamicAdaptersResult) {
        guard config.homeserver.scheme == "https", config.homeserver.host == "localhost", config.homeserver.port != nil else {
            throw MatrixWorkspaceError.invalidConfiguration
        }
        let certificate = try Data(contentsOf: URL(fileURLWithPath: manifest.certificateFile))
        let session = Session(accessToken: credentials.access_token, refreshToken: nil,
            userId: credentials.user_id, deviceId: credentials.device_id, homeserverUrl: config.homeserver.absoluteString,
            oauthData: nil, slidingSyncVersion: .native)
        let delegate = FixtureSessionDelegate(session)
        let client = try await MatrixClientFactory().makeClient(homeserverURL: config.homeserver,
            userID: credentials.user_id, deviceID: credentials.device_id, sessionDelegate: delegate, trustedRootCertificates: [certificate])
        try await client.restoreSession(session: session)
        let sync = try await client.syncService().withOfflineMode().finish()
        let entries = try await sync.roomListService().allRooms().entriesWithDynamicAdapters(pageSize: 100, listener: MatrixRoomListObserver())
        _ = entries.controller().setFilter(kind: .all(filters: []))
        syncStateHandles.append(sync.state(listener: SyncObserver()))
        await sync.start()
        if waitForRoom { try await wait("Native room did not synchronize") { try client.getRoom(roomId: config.roomID) != nil } }
        return (client, sync, entries)
    }

    func testRealJavaScriptSwiftExchangeRestartAndRecovery() async throws {
        guard let path = ProcessInfo.processInfo.environment["MATRIX_INTEROP_MANIFEST"], !path.isEmpty, !path.contains("$(") else {
            throw XCTSkip("Dedicated loopback fixture required; the interop CI job must execute this test")
        }
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        executionTimeAllowance = 240
        continueAfterFailure = false
        print("MatrixInterop: opening native SDK with fixture TLS root")
        let config: Configuration = try await control("config", manifest: manifest)
        var active = try await open(config.native, config: config, manifest: manifest)
        print("MatrixInterop: recovering existing identity")
        try await active.0.encryption().recover(recoveryKey: config.recovery)
        try await wait("Recovery must restore and verify the existing identity") { active.0.encryption().verificationState() == .verified }
        var room = try XCTUnwrap(try active.0.getRoom(roomId: config.roomID))
        let encrypted = await room.isEncrypted()
        XCTAssertTrue(encrypted)
        try await active.1.roomListService().setRoomSubscriptions(roomIds: [config.roomID])
        var timeline = try await room.timeline()
        var events = Events()
        var observer = Observer { [weak events] differences in Task { @MainActor in events?.update(differences) } }
        var handle = await timeline.addListener(listener: observer)
        print("MatrixInterop: checking encrypted Web delivery")
        let expected: Ready = try await control("ready", manifest: manifest)
        try await wait("Swift did not decrypt every reordered/retried Web message") {
            ["web", "retry", "first", "second"].allSatisfy { events.containing(config.markers[$0]!).count == 1 }
                && events.cannotDecrypt(expected.corruptID)
        }
        let content = try XCTUnwrap(timeline.createMessageContent(msgType: .text(content: TextMessageContent(body: config.markers["native"]!, formatted: nil))))
        _ = try await timeline.send(msg: content)
        print("MatrixInterop: checking encrypted native delivery")
        let receipt: Receipt = try await control("received", manifest: manifest)
        XCTAssertTrue(receipt.received, "The JS peer must decrypt a ciphertext-only native event")
        print("MatrixInterop: verifying encrypted image/audio and corrupted media")
        let media: Attachments = try await control("attachments", manifest: manifest)
        try await wait("Native SDK did not decode encrypted attachment metadata") {
            events.attachment(media.imageID) != nil && events.attachment(media.audioID) != nil && events.attachment(media.corruptID) != nil
        }
        let imageData = try XCTUnwrap(Data(base64Encoded: media.imageBytesBase64))
        let audioData = try XCTUnwrap(Data(base64Encoded: media.audioBytesBase64))
        let webImage = try XCTUnwrap(events.attachment(media.imageID))
        let webAudio = try XCTUnwrap(events.attachment(media.audioID))
        let downloadedImage = try await active.0.getMediaContent(mediaSource: webImage.source)
        let downloadedAudio = try await active.0.getMediaContent(mediaSource: webAudio.source)
        XCTAssertEqual(downloadedImage, imageData); XCTAssertEqual(downloadedAudio, audioData)
        let corruptMedia = try XCTUnwrap(events.attachment(media.corruptID))
        do {
            _ = try await active.0.getMediaContent(mediaSource: corruptMedia.source)
            XCTFail("The native SDK accepted a corrupted encrypted attachment")
        } catch { /* The official SDK must reject a mismatching ciphertext hash. */ }
        room.enableSendQueue(enable: true)
        let imageUpload = try timeline.sendImage(params: UploadParameters(source: .data(bytes: imageData, filename: "native-image.png"),
            caption: nil, formattedCaption: nil, mentions: nil, inReplyTo: nil), thumbnailSource: nil,
            imageInfo: ImageInfo(height: 1, width: 1, mimetype: "image/png", size: UInt64(imageData.count), thumbnailInfo: nil,
                thumbnailSource: nil, blurhash: nil, isAnimated: false))
        try await imageUpload.join()
        let audioUpload = try timeline.sendAudio(params: UploadParameters(source: .data(bytes: audioData, filename: "native-audio.wav"),
            caption: nil, formattedCaption: nil, mentions: nil, inReplyTo: nil), audioInfo: AudioInfo(duration: nil, size: UInt64(audioData.count), mimetype: "audio/wav"))
        try await audioUpload.join()
        let mediaReceipt: Receipt = try await control("attachments-received", manifest: manifest)
        XCTAssertTrue(mediaReceipt.received)
        print("MatrixInterop: checking group rotation and removed-member exclusion")
        let group: GroupScenario = try await control("group", manifest: manifest)
        try await wait("Native group did not synchronize") { try active.0.getRoom(roomId: group.roomID) != nil }
        let groupRoom = try XCTUnwrap(try active.0.getRoom(roomId: group.roomID))
        try await active.1.roomListService().setRoomSubscriptions(roomIds: [config.roomID, group.roomID])
        let groupTimeline = try await groupRoom.timeline()
        let groupEvents = Events()
        let groupObserver = Observer { [weak groupEvents] differences in Task { @MainActor in groupEvents?.update(differences) } }
        let groupHandle = await groupTimeline.addListener(listener: groupObserver)
        _ = try await groupTimeline.paginateBackwards(numEvents: 100)
        try await wait("A remaining native member could not decrypt the rotated group session") { groupEvents.containing(group.after).count == 1 }
        let groupContent = try XCTUnwrap(groupTimeline.createMessageContent(msgType: .text(content: TextMessageContent(body: group.native, formatted: nil))))
        groupRoom.enableSendQueue(enable: true)
        _ = try await groupTimeline.send(msg: groupContent)
        let groupReceipt: Receipt = try await control("group-received", manifest: manifest)
        XCTAssertTrue(groupReceipt.received)
        groupHandle.cancel()
        print("MatrixInterop: comparing SDK SAS codes")
        let verification = try await MatrixDeviceVerification.open(client: active.0, ownUserID: config.native.user_id, onRequest: {})
        let requested: Requested = try await control("verify", manifest: manifest)
        XCTAssertTrue(requested.requested)
        try await wait("The native verifier did not receive the real SDK request") { verification.phase == .requested }
        try await verification.accept(token: verification.flowToken)
        try await wait("The native verifier did not display SAS") { verification.phase == .comparing }
        let remoteSas: Sas = try await control("sas", manifest: manifest)
        if !verification.symbols.isEmpty { XCTAssertEqual(verification.symbols.map { $0.0 }, remoteSas.emoji) }
        else { XCTAssertEqual(verification.decimals, remoteSas.decimal) }
        try await verification.confirm(token: verification.flowToken)
        let trusted: Verified = try await control("confirm-sas", manifest: manifest)
        XCTAssertTrue(trusted.verified)
        try await wait("The native SDK did not finish SAS verification") { verification.phase == .done }
        verification.close()
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
        let first: Fresh = try await control("new-account", manifest: manifest)
        let firstSession = try await open(first.native, config: config, manifest: manifest, waitForRoom: false)
        await firstSession.0.encryption().waitForE2eeInitializationTasks()
        try await wait("First native device did not bootstrap its new identity") { firstSession.0.encryption().verificationState() == .verified }
        let recoveryKey = try await firstSession.0.encryption().enableRecovery(waitForBackupsToUpload: true, passphrase: nil, progressListener: RecoveryProgress())
        XCTAssertFalse(recoveryKey.isEmpty)
        let firstReady: FirstReady = try await control("first-device-check", manifest: manifest)
        XCTAssertTrue(firstReady.ready)
        await firstSession.1.stop()
        let result: Complete = try await control("complete", manifest: manifest)
        XCTAssertTrue(result.completed)
        handle.cancel(); await active.1.stop()
    }
}
