import AVFoundation
import ImageIO
import UniformTypeIdentifiers
import AuthenticationServices
import Combine
import Foundation
import MatrixRustSDK
import SwiftUI
import UIKit

private final class MatrixRecoveryProgressObserver: EnableRecoveryProgressListener, @unchecked Sendable {
    func onUpdate(status: EnableRecoveryProgress) {}
}

private final class MatrixTimelineObserver: TimelineListener, @unchecked Sendable {
    let update: @Sendable ([TimelineDiff]) -> Void
    init(_ update: @escaping @Sendable ([TimelineDiff]) -> Void) { self.update = update }
    func onUpdate(diff: [TimelineDiff]) { update(diff) }
}

struct NativeMatrixAttachment {
    let source: MediaSource
    let mimetype: String
    let size: UInt64
    let image: Bool

    init?(source: MediaSource, mimetype: String?, size: UInt64?, image: Bool) {
        let allowed: Set<String> = image ? ["image/jpeg", "image/png", "image/webp"]
            : ["audio/mp4", "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav"]
        guard let mimetype, allowed.contains(mimetype), let size, size > 0, size <= 10 * 1024 * 1024,
              let data = source.toJson().data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let file = json["file"] as? [String: Any], file["v"] as? String == "v2",
              (file["hashes"] as? [String: String])?["sha256"] != nil else { return nil }
        self.source = source; self.mimetype = mimetype; self.size = size; self.image = image
    }
}

struct NativeMatrixMessage: Identifiable {
    let id: String
    let eventID: EventOrTransactionId
    let sender: String
    let body: String
    let own: Bool
    let date: Date
    let warning: String?
    let canRetry: Bool
    let editable: Bool
    let attachment: NativeMatrixAttachment?
}

@MainActor
final class NativeMatrixWorkspaceModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var config: NativeMatrixConfig?
    @Published var legacy = false
    @Published var busy = false
    @Published var ready = false
    @Published var error: String?
    @Published var chats: [ServerChat] = []
    @Published var messages: [NativeMatrixMessage] = []
    @Published var selected: UUID?
    @Published var text = ""
    @Published var recoveryKey = ""
    @Published var generatedRecoveryKey: String?
    @Published var deviceVerification: MatrixDeviceVerification?
    @Published var showDeviceVerification = false
    @Published var showRecoverySettings = false
    @Published var editing: EventOrTransactionId?
    private let metadata: MatrixMetadataService
    private let owner: UUID
    private let factory = MatrixClientFactory()
    private var client: Client?
    private var keychain: MatrixSessionKeychain?
    private var sync: SyncService?
    private var browser: ASWebAuthenticationSession?
    private var browserContinuation: CheckedContinuation<URL, Error>?
    private var authorization: OAuthAuthorizationData?
    private var timeline: Timeline?
    private var timelineObserver: MatrixTimelineObserver?
    private var timelineHandle: TaskHandle?
    private var timelineItems: [TimelineItem] = []
    private var generation = UUID()
    private var selectionGeneration = UUID()

    init(container: AppContainer) {
        metadata = container.makeMatrixMetadataService()
        owner = container.sessionStore.currentUserID ?? SessionStore.Constants.defaultUserID
        super.init()
    }

    func loadConfiguration() async {
        let current = generation
        do {
            let result = try await metadata.config(owner: owner)
            guard generation == current else { return }
            config = result
            legacy = result == nil
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func connect() async {
        guard let config, !busy else { return }
        busy = true; error = nil
        let current = generation
        do {
            let registration = Bundle.main.object(forInfoDictionaryKey: "MATRIX_IOS_CLIENT_ID") as? String ?? ""
            guard !registration.isEmpty, !registration.contains("$("), registration.range(of: "^[0-7][0-9A-HJKMNP-TV-Z]{25}$", options: .regularExpression) != nil else {
                throw MatrixWorkspaceError.missingNativeRegistration
            }
            let vault = try MatrixSessionKeychain(config: config) { [weak self] in
                Task { @MainActor in
                    guard let self, self.generation == current else { return }
                    self.close()
                    self.error = "Не удалось сохранить обновлённую сессию. Переписка заблокирована"
                }
            }
            keychain = vault
            let next = try await factory.makeClient(homeserverURL: config.homeserverURL,
                userID: config.expectedUserID, deviceID: vault.deviceID, sessionDelegate: vault)
            guard generation == current else { vault.close(); return }
            client = next
            if let restored = vault.restoredSession {
                try await next.restoreSession(session: restored)
            } else {
                var registrations: [String: String] = [:]
                for endpoint in [config.homeserverURL, config.issuerURL] {
                    let origin = endpoint.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                    registrations[origin] = registration
                    registrations[origin + "/"] = registration
                }
                let oauth = OAuthConfiguration(clientName: "Mobile Messenger", redirectUri: "mobilemessenger://matrix/callback",
                    clientUri: config.homeserverURL.absoluteString, logoUri: nil, tosUri: nil, policyUri: nil,
                    staticRegistrations: registrations)
                let data = try await next.urlForOauth(oauthConfiguration: oauth, prompt: nil, loginHint: nil,
                                                     deviceId: vault.deviceID, additionalScopes: nil)
                guard generation == current, let url = URL(string: data.loginUrl()),
                      url.scheme == "https", url.host == config.issuerURL.host, url.port == config.issuerURL.port,
                      url.user == nil, url.password == nil else {
                    throw MatrixWorkspaceError.invalidConfiguration
                }
                authorization = data
                let callback = try await authenticate(url: url)
                guard generation == current else { throw MatrixWorkspaceError.sessionClosed }
                try await next.loginWithOauthCallback(callbackUrl: callback.absoluteString)
            }
            guard generation == current else { throw MatrixWorkspaceError.sessionClosed }
            let session = try next.session()
            guard session.userId == config.expectedUserID, session.deviceId == vault.deviceID else {
                try? await next.logout()
                throw MatrixWorkspaceError.invalidConfiguration
            }
            try vault.save(session)
            await next.encryption().waitForE2eeInitializationTasks()
            guard generation == current else { throw MatrixWorkspaceError.sessionClosed }
            await next.enableAllSendQueues(enable: false)
            let service = try await next.syncService().withOfflineMode().finish()
            guard generation == current else { await service.stop(); return }
            sync = service
            deviceVerification = try await MatrixDeviceVerification.open(client: next, ownUserID: config.expectedUserID) { [weak self] in
                guard let self, self.generation == current else { return }
                if !self.showRecoverySettings { self.showDeviceVerification = true }
            }
            await service.start()
            let list = try await metadata.chats()
            guard generation == current else { return }
            chats = list; ready = true
        } catch {
            if generation == current {
                let message = error.localizedDescription
                close()
                self.error = message
            }
        }
        if generation == current { busy = false }
    }

    func open(chatID: UUID) async {
        guard ready, let client, let config else { return }
        let current = generation
        let selection = UUID(); selectionGeneration = selection
        selected = chatID; messages = []; text = ""; editing = nil
        timelineHandle?.cancel(); timelineHandle = nil
        timeline = nil; timelineItems = []
        do {
            let room = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
            guard generation == current, selectionGeneration == selection else { return }
            let next = try await room.timeline()
            guard generation == current, selectionGeneration == selection else { return }
            timeline = next
            let observer = MatrixTimelineObserver { [weak self] diff in
                Task { @MainActor in
                    guard let self, self.generation == current, self.selectionGeneration == selection else { return }
                    self.apply(diff)
                }
            }
            timelineObserver = observer
            let handle = await next.addListener(listener: observer)
            guard generation == current, selectionGeneration == selection else { handle.cancel(); return }
            timelineHandle = handle
            _ = try await next.paginateBackwards(numEvents: 50)
        } catch { if generation == current, selectionGeneration == selection { self.error = error.localizedDescription } }
    }

    private func protectedRoom(chatID: UUID, client: Client, config: NativeMatrixConfig, generation current: UUID) async throws -> Room {
        var descriptor = try await metadata.descriptor(chatID: chatID)
        try descriptor.validate(chatID: chatID, owner: config.expectedUserID)
        guard generation == current else { throw MatrixWorkspaceError.sessionClosed }
        if descriptor.roomID == nil {
            let roomID = try await client.createRoom(request: CreateRoomParameters(name: nil, isEncrypted: true,
                isDirect: descriptor.participants.count == 2, visibility: .private, preset: .privateChat,
                invite: descriptor.participants.map(\.matrixUserID).filter { $0 != config.expectedUserID }, historyVisibilityOverride: .joined))
            guard generation == current else { throw MatrixWorkspaceError.sessionClosed }
            do { descriptor = try await metadata.bind(chatID: chatID, roomID: roomID, epoch: descriptor.epoch) }
            catch {
                if let orphan = try? client.getRoom(roomId: roomID) { try? await orphan.leave() }
                throw error
            }
        }
        try descriptor.validate(chatID: chatID, owner: config.expectedUserID)
        guard generation == current, let roomID = descriptor.roomID else { throw MatrixWorkspaceError.sessionClosed }
        let room: Room
        if let existing = try client.getRoom(roomId: roomID), existing.membership() == .joined { room = existing }
        else { room = try await client.joinRoomById(roomId: roomID) }
        guard try await room.latestEncryptionState() == .encrypted, await room.isEncrypted() else {
            throw MatrixWorkspaceError.roomChanged
        }
        let iterator = try await room.members()
        guard iterator.len() <= 128 else { throw MatrixWorkspaceError.roomChanged }
        var actual: [String] = []
        while let chunk = iterator.nextChunk(chunkSize: 128), !chunk.isEmpty {
            actual += chunk.filter { $0.membership == .join || $0.membership == .invite }.map(\.userId)
        }
        let expected = descriptor.participants.map(\.matrixUserID)
        guard actual.count == expected.count, Set(actual) == Set(expected) else { throw MatrixWorkspaceError.roomChanged }
        for participant in expected {
            if let identity = try await client.encryption().userIdentity(userId: participant, fallbackToServer: true),
               identity.hasVerificationViolation() || (identity.wasPreviouslyVerified() && !identity.isVerified()) {
                throw MatrixWorkspaceError.roomChanged
            }
        }
        guard generation == current else { throw MatrixWorkspaceError.sessionClosed }
        return room
    }

    func send() async {
        guard ready, !busy, let chatID = selected, let client, let config,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 4000 else { return }
        busy = true; let current = generation; let selection = selectionGeneration; let body = text
        defer { if generation == current { busy = false } }
        do {
            guard client.encryption().verificationState() == .verified else {
                throw NSError(domain: "Matrix", code: 1, userInfo: [NSLocalizedDescriptionKey: "Восстановите ключи или подтвердите это устройство перед отправкой"])
            }
            let room = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
            guard generation == current, selectionGeneration == selection else { throw MatrixWorkspaceError.sessionClosed }
            let next = try await room.timeline()
            guard let content = next.createMessageContent(msgType: .text(content: TextMessageContent(body: body, formatted: nil))) else {
                throw MatrixWorkspaceError.roomChanged
            }
            room.enableSendQueue(enable: true)
            if let editing { try await next.edit(eventOrTransactionId: editing, newContent: .roomMessage(content: content)) }
            else { _ = try await next.send(msg: content) }
            if generation == current, selectionGeneration == selection { text = ""; editing = nil }
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func sendAttachment(url: URL) async {
        guard ready, !busy, let chatID = selected, let client, let config, url.isFileURL else { return }
        busy = true; let current = generation; let selection = selectionGeneration
        defer { if generation == current { busy = false } }
        do {
            guard client.encryption().verificationState() == .verified else {
                throw NSError(domain: "MatrixAttachment", code: 1, userInfo: [NSLocalizedDescriptionKey: "Сначала подтвердите устройство"])
            }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
            let mime = values.contentType?.preferredMIMEType ?? ""
            let image = ["image/jpeg", "image/png", "image/webp"].contains(mime)
            let audio = ["audio/mp4", "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav"].contains(mime)
            guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= 10 * 1024 * 1024, image || audio else {
                throw NSError(domain: "MatrixAttachment", code: 2, userInfo: [NSLocalizedDescriptionKey: "Выберите изображение или аудио размером до 10 МБ"])
            }
            let data = try Data(contentsOf: url)
            guard data.count == size else { throw MatrixWorkspaceError.roomChanged }
            let room = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
            guard generation == current, selectionGeneration == selection else { return }
            let next = try await room.timeline()
            let params = UploadParameters(source: .data(bytes: data, filename: String(url.lastPathComponent.prefix(160))),
                caption: nil, formattedCaption: nil, mentions: nil, inReplyTo: nil)
            room.enableSendQueue(enable: true)
            let handle: SendAttachmentJoinHandle
            if image {
                handle = try next.sendImage(params: params, thumbnailSource: nil,
                    imageInfo: ImageInfo(height: nil, width: nil, mimetype: mime, size: UInt64(size),
                        thumbnailInfo: nil, thumbnailSource: nil, blurhash: nil, isAnimated: nil))
            } else {
                handle = try next.sendAudio(params: params, audioInfo: AudioInfo(duration: nil, size: UInt64(size), mimetype: mime))
            }
            // SDK encryption, upload, durable queue and hash metadata remain one operation.
            try await handle.join()
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func downloadAttachment(_ message: NativeMatrixMessage) async throws -> Data {
        guard ready, let chatID = selected, let client, let config, let attachment = message.attachment else {
            throw MatrixWorkspaceError.sessionClosed
        }
        let current = generation; let selection = selectionGeneration
        _ = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
        guard generation == current, selectionGeneration == selection,
              messages.contains(where: { $0.id == message.id && $0.attachment?.source.toJson() == attachment.source.toJson() }) else {
            throw MatrixWorkspaceError.sessionClosed
        }
        // The SDK verifies the encrypted media hash and decrypts with its descriptor.
        let data = try await client.getMediaContent(mediaSource: attachment.source)
        guard generation == current, selectionGeneration == selection, data.count == Int(attachment.size),
              messages.contains(where: { $0.id == message.id && $0.attachment != nil }) else {
            throw MatrixWorkspaceError.sessionClosed
        }
        return data
    }

    func redact(_ message: NativeMatrixMessage) async {
        guard message.own, let chatID = selected, let client, let config, !busy else { return }
        let current = generation; let selection = selectionGeneration
        busy = true
        defer { if generation == current { busy = false } }
        do {
            let room = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
            guard generation == current, selectionGeneration == selection else { return }
            try await room.timeline().redactEvent(eventOrTransactionId: message.eventID, reason: nil)
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func retry(_ message: NativeMatrixMessage) async {
        guard message.own, message.canRetry, let chatID = selected, let client, let config, !busy else { return }
        let current = generation; let selection = selectionGeneration
        busy = true
        defer { if generation == current { busy = false } }
        do {
            guard client.encryption().verificationState() == .verified else { throw MatrixWorkspaceError.roomChanged }
            let room = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
            guard generation == current, selectionGeneration == selection else { return }
            room.enableSendQueue(enable: true)
            _ = try await room.timeline().retrySend(itemId: message.eventID, target: .event)
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func requestDeviceVerification(peer: Bool = false) async {
        guard let deviceVerification, !busy else { return }
        if deviceVerification.isPending { showDeviceVerification = true; return }
        let current = generation
        do {
            var userID: String?
            if peer {
                guard let chatID = selected, let client, let config else { throw MatrixWorkspaceError.roomChanged }
                _ = try await protectedRoom(chatID: chatID, client: client, config: config, generation: current)
                let descriptor = try await metadata.descriptor(chatID: chatID)
                try descriptor.validate(chatID: chatID, owner: config.expectedUserID)
                let peers = descriptor.participants.filter { $0.matrixUserID != config.expectedUserID }
                guard peers.count == 1 else { throw MatrixWorkspaceError.roomChanged }
                userID = peers[0].matrixUserID
            }
            guard generation == current else { return }
            showDeviceVerification = true
            try await deviceVerification.request(userID: userID)
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func setupRecovery() async {
        guard let client, let config, !busy else { return }
        let current = generation; busy = true
        defer { if generation == current { busy = false } }
        do {
            let encryption = client.encryption()
            await encryption.waitForE2eeInitializationTasks()
            guard generation == current else { return }
            guard encryption.recoveryState() == .disabled,
                  let identity = try await encryption.userIdentity(userId: config.expectedUserID, fallbackToServer: true), identity.isVerified() else {
                throw NSError(domain: "Matrix", code: 3, userInfo: [NSLocalizedDescriptionKey: "У аккаунта уже есть ключи или устройство не подтверждено. Восстановите существующий ключ либо проверьте устройство"])
            }
            let key = try await encryption.enableRecovery(waitForBackupsToUpload: true, passphrase: nil, progressListener: MatrixRecoveryProgressObserver())
            if generation == current { generatedRecoveryKey = key }
        } catch { if generation == current { self.error = error.localizedDescription } }
    }

    func recover() async {
        guard let client, !busy else { return }
        let current = generation; let key = recoveryKey
        recoveryKey = ""; busy = true
        do { try await client.encryption().recover(recoveryKey: key) }
        catch { if generation == current { self.error = error.localizedDescription } }
        if generation == current { busy = false }
    }

    func loadEarlier() async {
        let current = generation; let selection = selectionGeneration
        do { _ = try await timeline?.paginateBackwards(numEvents: 50) }
        catch { if generation == current, selectionGeneration == selection { self.error = error.localizedDescription } }
    }

    func close() {
        generation = UUID(); selectionGeneration = UUID()
        browser?.cancel(); browser = nil
        browserContinuation?.resume(throwing: MatrixWorkspaceError.sessionClosed); browserContinuation = nil
        authorization = nil
        keychain?.close(); keychain = nil
        deviceVerification?.close(); deviceVerification = nil; showDeviceVerification = false; showRecoverySettings = false
        timelineHandle?.cancel(); timelineHandle = nil; timelineObserver = nil
        let previous = sync; sync = nil
        let previousClient = client
        Task { await previousClient?.enableAllSendQueues(enable: false); await previous?.stop() }
        timeline = nil; timelineItems = []; messages = []; chats = []
        client = nil; ready = false; busy = false; recoveryKey = ""; generatedRecoveryKey = nil; text = ""; editing = nil
    }

    private func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            browserContinuation = continuation
            let current = generation
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "mobilemessenger") { [weak self] callback, error in
                Task { @MainActor in
                    guard let self, self.generation == current, let pending = self.browserContinuation else { return }
                    self.browserContinuation = nil; self.browser = nil
                    if let error { pending.resume(throwing: error) }
                    else if let callback, callback.host == "matrix", callback.path == "/callback" { pending.resume(returning: callback) }
                    else { pending.resume(throwing: MatrixWorkspaceError.invalidConfiguration) }
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            browser = session
            if !session.start() {
                browserContinuation = nil; browser = nil
                continuation.resume(throwing: MatrixWorkspaceError.invalidConfiguration)
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }

    private func apply(_ diffs: [TimelineDiff]) {
        for diff in diffs {
            switch diff {
            case .append(let values): timelineItems.append(contentsOf: values)
            case .clear: timelineItems.removeAll()
            case .pushFront(let value): timelineItems.insert(value, at: 0)
            case .pushBack(let value): timelineItems.append(value)
            case .popFront: if !timelineItems.isEmpty { timelineItems.removeFirst() }
            case .popBack: _ = timelineItems.popLast()
            case .insert(let index, let value): if Int(index) <= timelineItems.count { timelineItems.insert(value, at: Int(index)) }
            case .set(let index, let value): if Int(index) < timelineItems.count { timelineItems[Int(index)] = value }
            case .remove(let index): if Int(index) < timelineItems.count { timelineItems.remove(at: Int(index)) }
            case .truncate(let length): timelineItems = Array(timelineItems.prefix(Int(length)))
            case .reset(let values): timelineItems = values
            }
        }
        messages = timelineItems.compactMap { item in
            guard let event = item.asEvent(), case .msgLike(let content) = event.content else { return nil }
            let info = event.lazyProvider.debugInfo()
            func encrypted(_ json: String?) -> Bool {
                guard let json, let data = json.data(using: .utf8),
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
                return object["type"] as? String == "m.room.encrypted"
            }
            if event.isRemote && (!encrypted(info.originalJson) || (info.latestEditJson != nil && !encrypted(info.latestEditJson))) { return nil }
            let body: String
            var attachment: NativeMatrixAttachment?
            switch content.kind {
            case .message(let message):
                body = message.body
                switch message.msgType {
                case .image(let media): attachment = NativeMatrixAttachment(source: media.source, mimetype: media.info?.mimetype, size: media.info?.size, image: true)
                case .audio(let media): attachment = NativeMatrixAttachment(source: media.source, mimetype: media.info?.mimetype, size: media.info?.size, image: false)
                default: break
                }
            case .redacted: body = "Сообщение удалено"
            case .unableToDecrypt: body = "Не удалось расшифровать сообщение"
            default: return nil
            }
            let id: String
            switch event.eventOrTransactionId {
            case .eventId(let value): id = value
            case .transactionId(let value): id = value
            }
            let warning: String?
            let canRetry: Bool
            if !event.isRemote {
                switch event.localSendState {
                case .sendingFailed?: warning = "Не отправлено"; canRetry = true
                case .sent?: warning = "Отправлено"; canRetry = false
                default: warning = "Ожидает отправки"; canRetry = false
                }
            }
            else {
                canRetry = false
                switch event.lazyProvider.getShields(strict: true) {
                case .none: warning = nil
                default: warning = "Устройство отправителя не подтверждено"
                }
            }
            return NativeMatrixMessage(id: id, eventID: event.eventOrTransactionId, sender: event.sender,
                body: body, own: event.isOwn, date: Date(timeIntervalSince1970: Double(event.timestamp) / 1000), warning: warning, canRetry: canRetry, editable: event.isEditable && attachment == nil, attachment: attachment)
        }
    }
}

@MainActor
struct MatrixChatEntryView: View {
    @ObservedObject var container: AppContainer
    let initialChat: ChatListItem?
    @StateObject private var model: NativeMatrixWorkspaceModel
    @State private var choosingAttachment = false
    init(container: AppContainer, initialChat: ChatListItem? = nil) {
        self.container = container
        self.initialChat = initialChat
        _model = StateObject(wrappedValue: container.makeNativeMatrixWorkspace())
    }
    var body: some View {
        Group {
            if model.legacy {
                if let initialChat { LegacyDialogueView(chat: initialChat, container: container) }
                else { ChatListView(container: container) }
            } else if model.ready, let initialChat {
                conversation(id: initialChat.id, title: initialChat.title)
            } else {
                NavigationStack {
                    if model.ready {
                        List(model.chats, id: \.id) { chat in
                            NavigationLink {
                                conversation(id: chat.id, title: chat.title)
                            } label: { Text(chat.title) }
                        }
                        .navigationTitle("Сообщения")
                        .toolbar {
                            Menu {
                                Button("Подтвердить устройство") { Task { await model.requestDeviceVerification() } }
                                Button("Ключи и восстановление") { model.showRecoverySettings = true }
                                Button("Заблокировать") { model.close() }
                            } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("Настройки переписки") }
                        }
                    } else {
                        VStack(spacing: 16) {
                            Text("Защищённая переписка").font(.title2)
                            if model.config != nil {
                                Text("Подтвердите вход своим номером. Сессия устройства хранится в Связке ключей.")
                                    .font(.body).foregroundStyle(.secondary)
                                Button("Открыть переписку") { Task { await model.connect() } }.disabled(model.busy)
                            } else if model.error == nil { ProgressView("Проверяем настройки переписки") }
                            if let error = model.error { Text(error).foregroundStyle(.red).accessibilityLabel("Ошибка: \(error)") }
                        }.padding(24)
                    }
                }
            }
        }
        .sheet(isPresented: $model.showDeviceVerification, onDismiss: { Task { await model.deviceVerification?.cancel() } }) {
            if let verification = model.deviceVerification { MatrixDeviceVerificationView(verification: verification) }
        }
        .sheet(isPresented: $model.showRecoverySettings) { NativeMatrixRecoveryView(model: model) }
        .task { if model.config == nil && !model.legacy { await model.loadConfiguration() } }
    }

    private func conversation(id: UUID, title: String) -> some View {
        VStack(spacing: 0) {
            if let error = model.error { Text(error).font(.footnote).foregroundStyle(.red).padding() }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    Button("Загрузить более ранние сообщения") { Task { await model.loadEarlier() } }.font(.footnote)
                    ForEach(model.selected == id ? model.messages : []) { message in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(message.own ? "Вы" : message.sender).font(.caption).foregroundStyle(.secondary)
                            Text(message.body).textSelection(.enabled)
                            if message.attachment != nil { NativeMatrixAttachmentView(model: model, message: message) }
                            Text(message.date, style: .time).font(.caption2).foregroundStyle(.secondary)
                            if let warning = message.warning { Text(warning).font(.caption).foregroundStyle(.orange) }
                        }.padding(12).frame(maxWidth: .infinity, alignment: message.own ? .trailing : .leading)
                        .contextMenu {
                            if message.own {
                                if message.editable { Button("Изменить") { model.editing = message.eventID; model.text = message.body } }
                                if message.canRetry { Button("Повторить отправку") { Task { await model.retry(message) } } }
                                Button("Удалить", role: .destructive) { Task { await model.redact(message) } }
                            }
                        }
                    }
                }.padding(16)
            }
            Divider()
            if model.selected == id, model.editing != nil {
                HStack { Text("Редактирование сообщения"); Spacer(); Button("Отменить") { model.editing = nil; model.text = "" } }
                    .font(.footnote).padding(.horizontal, 16)
            }
            if model.selected == id {
            HStack(alignment: .bottom) {
                if model.editing == nil { Button { choosingAttachment = true } label: {
                    Image(systemName: "paperclip").accessibilityLabel("Прикрепить изображение или аудио")
                }.disabled(model.busy) }
                TextField("Сообщение", text: $model.text, axis: .vertical).lineLimit(1...5)
                Button(model.editing == nil ? "Отправить" : "Сохранить") { Task { await model.send() } }.disabled(model.busy || model.text.isEmpty)
            }.padding(16)
            HStack {
                Button("Подтвердить устройство") { Task { await model.requestDeviceVerification() } }
                Spacer()
                Button("Проверить собеседника") { Task { await model.requestDeviceVerification(peer: true) } }
            }.font(.footnote).padding(.horizontal, 16)
            DisclosureGroup("Ключи и восстановление") { NativeMatrixRecoveryView(model: model) }
.font(.footnote).padding(.horizontal, 16).padding(.bottom, 12)
            }
        }
        .navigationTitle(title)
        .fileImporter(isPresented: $choosingAttachment, allowedContentTypes: [.jpeg, .png, .webP, .audio]) { result in
            switch result {
            case .success(let url): Task { await model.sendAttachment(url: url) }
            case .failure: model.error = "Не удалось открыть файл"
            }
        }
        .task(id: id) { await model.open(chatID: id) }
    }
}


@MainActor
private struct NativeMatrixRecoveryView: View {
    @ObservedObject var model: NativeMatrixWorkspaceModel
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Ключи и восстановление").font(.title2)
            Button("Настроить восстановление") { Task { await model.setupRecovery() } }.disabled(model.busy)
            if let key = model.generatedRecoveryKey {
                Text("Сохраните ключ вне приложения. Он даёт доступ к истории сообщений")
                Text(key).font(.body.monospaced()).textSelection(.enabled)
                Button("Ключ сохранён") { model.generatedRecoveryKey = nil }
            }
            SecureField("Ключ восстановления", text: $model.recoveryKey)
                .textContentType(nil).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Восстановить ключи") { Task { await model.recover() } }.disabled(model.busy)
            if let error = model.error { Text(error).font(.footnote).foregroundStyle(.red) }
        }.padding(24)
    }
}


@MainActor
private struct NativeMatrixAttachmentView: View {
    @ObservedObject var model: NativeMatrixWorkspaceModel
    let message: NativeMatrixMessage
    @State private var image: UIImage?
    @State private var player: AVAudioPlayer?
    @State private var download: Task<Void, Never>?
    @State private var error: String?
    @State private var active = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let image { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 320) }
            else if let player {
                Button("Воспроизвести аудио") { player.currentTime = 0; player.play() }
                Button("Остановить") { player.stop() }
            } else {
                Button(download == nil ? "Открыть вложение" : "Проверяем вложение…") { open() }.disabled(download != nil)
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .onAppear { active = true }
        .onDisappear { active = false; download?.cancel(); download = nil; player?.stop(); player = nil; image = nil }
    }

    private func open() {
        guard download == nil else { return }
        error = nil
        download = Task { @MainActor in
            defer { if active { download = nil } }
            do {
                let data = try await model.downloadAttachment(message)
                guard active, !Task.isCancelled else { return }
                if message.attachment?.image == true {
                    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                          let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                            kCGImageSourceCreateThumbnailFromImageAlways: true,
                            kCGImageSourceThumbnailMaxPixelSize: 2048,
                            kCGImageSourceCreateThumbnailWithTransform: true
                          ] as CFDictionary) else { throw MatrixWorkspaceError.roomChanged }
                    image = UIImage(cgImage: thumbnail)
                } else { player = try AVAudioPlayer(data: data); player?.prepareToPlay() }
            } catch { if active && !Task.isCancelled { self.error = "Не удалось проверить и открыть вложение" } }
        }
    }
}
