@testable import MobileMessengerIOS
import XCTest

@MainActor
func makeSessionStore() -> SessionStore {
    SessionStore(
        tokenStore: InMemoryTokenStore(),
        defaults: UserDefaults(suiteName: UUID().uuidString)!
    )
}

final class ChatRepositorySpy: ChatRepository {
    var cachedChatsResult: [Chat] = []
    var listChatsResult: [Chat] = []
    var createChatResult = Chat(
        id: UUID(),
        title: "Chat",
        lastMessagePreview: nil,
        lastActivity: Date(),
        unreadCount: 0
    )
    var sendMessageResult = Message(
        id: Message.Identifier(chatID: UUID(), messageID: UUID()),
        localID: UUID(),
        authorID: SessionStore.Constants.currentUserID,
        authorName: SessionStore.Constants.currentUserDisplayName,
        kind: .text,
        text: "",
        createdAt: Date(),
        status: .sending
    )
    var historyResult: [Message] = []
    var cachedHistoryResult: [Message]?
    var observedChats: AsyncStream<[Chat]> = AsyncStream { continuation in
        continuation.finish()
    }

    var observedMessages: AsyncStream<Message> = AsyncStream { continuation in
        continuation.finish()
    }

    var onSendMessage: ((UUID, String, UUID?) -> Void)?
    var sendMessageHandler: ((UUID, String, UUID?) -> Message)?
    var loadHistoryHandler: ((UUID, Int, UUID?) -> [Message])?
    var onMarkMessage: ((UUID) -> Void)?
    var onObserveMessages: ((UUID) -> Void)?
    var deletedChatIDs: [UUID] = []
    var markedMessageIDs: [UUID] = []
    var historyLoadCount = 0
    var historyRequests: [(chatID: UUID, limit: Int, before: UUID?)] = []
    var observedMessageChatIDs: [UUID] = []

    func createChat(title _: String, participantContacts _: [String]) async throws -> Chat {
        createChatResult
    }

    func deleteChat(chatID: UUID) async throws {
        deletedChatIDs.append(chatID)
    }

    func cachedChats(searchQuery _: String?) async -> [Chat] {
        cachedChatsResult
    }

    func listChats(searchQuery _: String?) async throws -> [Chat] {
        listChatsResult
    }

    func observeChats() -> AsyncStream<[Chat]> {
        observedChats
    }

    func observeMessages(for chatID: UUID) async -> AsyncStream<Message> {
        observedMessageChatIDs.append(chatID)
        onObserveMessages?(chatID)
        return observedMessages
    }

    func cachedHistory(for _: UUID, limit _: Int, before _: UUID?) async -> [Message] {
        cachedHistoryResult ?? historyResult
    }

    func loadHistory(for chatID: UUID, limit: Int, before: UUID?) async throws -> [Message] {
        historyLoadCount += 1
        historyRequests.append((chatID, limit, before))
        return loadHistoryHandler?(chatID, limit, before) ?? historyResult
    }

    func sendMessage(chatID: UUID, text: String, localID: UUID?) async throws -> Message {
        onSendMessage?(chatID, text, localID)
        return sendMessageHandler?(chatID, text, localID) ?? sendMessageResult
    }

    func sendImageMessage(chatID _: UUID, imageData _: Data, caption _: String?, localID _: UUID?) async throws -> Message {
        sendMessageResult
    }

    func editMessage(chatID _: UUID, messageID _: UUID, text _: String) async throws -> Message {
        sendMessageResult
    }

    func deleteMessage(chatID _: UUID, messageID _: UUID) async throws -> Message {
        sendMessageResult
    }

    func setTyping(chatID _: UUID, isTyping _: Bool) async {}

    func retryPendingMessages(for _: UUID) async {}

    func refreshForForeground() async {}

    func markMessage(_ messageID: UUID, in _: UUID, with _: MessageStatus) async throws {
        markedMessageIDs.append(messageID)
        onMarkMessage?(messageID)
    }

    func resetLocalState() async {}
}

final class FakeRealtimeSocketTask: RealtimeSocketTask {
    private actor State {
        var queued: [Result<URLSessionWebSocketTask.Message, Error>] = []
        var waiters: [CheckedContinuation<Result<URLSessionWebSocketTask.Message, Error>, Never>] = []
        var cancelCount = 0
        var pingCount = 0

        func enqueue(_ item: Result<URLSessionWebSocketTask.Message, Error>) {
            if let waiter = waiters.first {
                waiters.removeFirst()
                waiter.resume(returning: item)
            } else {
                queued.append(item)
            }
        }

        func next() async -> Result<URLSessionWebSocketTask.Message, Error> {
            if !queued.isEmpty {
                return queued.removeFirst()
            }

            return await withCheckedContinuation { continuation in
                waiters.append(continuation)
            }
        }

        func recordCancel() {
            cancelCount += 1
            enqueue(.failure(CancellationError()))
        }

        func recordPing() {
            pingCount += 1
        }
    }

    private let state = State()
    var pingError: Error?

    var cancelCount: Int {
        get async { await state.cancelCount }
    }

    var pingCount: Int {
        get async { await state.pingCount }
    }

    func enqueue(text: String) {
        Task {
            await state.enqueue(.success(.string(text)))
        }
    }

    func enqueue(error: Error) {
        Task {
            await state.enqueue(.failure(error))
        }
    }

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        _ = closeCode
        _ = reason
        Task { await state.recordCancel() }
    }

    func send(_ message: URLSessionWebSocketTask.Message) async throws {
        _ = message
    }

    func receive() async throws -> URLSessionWebSocketTask.Message {
        switch await state.next() {
        case let .success(message):
            return message
        case let .failure(error):
            throw error
        }
    }

    func sendPing() async throws {
        await state.recordPing()
        if let pingError {
            throw pingError
        }
    }
}

struct RealtimeServiceStub: ChatRealtimeService {
    var sendError: Error?

    func activate() {}
    func deactivate() {}
    func handleLogout() {}
    func connect(to chatID: UUID) {
        _ = chatID
    }

    func disconnect(from chatID: UUID) {
        _ = chatID
    }

    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        _ = chatID
        return AsyncStream { continuation in continuation.finish() }
    }

    func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope> {
        AsyncStream { continuation in continuation.finish() }
    }

    func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState> {
        AsyncStream { continuation in
            continuation.yield(.connected)
            continuation.finish()
        }
    }

    func sendMessage(
        chatID: UUID,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        clientMessageID: UUID
    ) async throws -> Message {
        _ = chatID
        _ = kind
        _ = text
        _ = mediaID
        if let sendError {
            throw sendError
        }
        return Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: clientMessageID,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            kind: kind,
            text: text ?? "",
            createdAt: Date(),
            status: .delivered
        )
    }

    func setTyping(chatID: UUID, isTyping: Bool) async {
        _ = chatID
        _ = isTyping
    }

    func markRead(chatID: UUID, messageID: UUID) async {
        _ = chatID
        _ = messageID
    }
}

final class SequencedRealtimeServiceStub: ChatRealtimeService, @unchecked Sendable {
    private let lock = NSLock()
    private var outcomes: [Result<Message, Error>]

    init(outcomes: [Result<Message, Error>]) {
        self.outcomes = outcomes
    }

    func replaceNextSuccess(with message: Message) {
        lock.lock()
        defer { lock.unlock() }
        if outcomes.count > 1 {
            outcomes[1] = .success(message)
        } else {
            outcomes.append(.success(message))
        }
    }

    func activate() {}
    func deactivate() {}
    func handleLogout() {}
    func connect(to chatID: UUID) {
        _ = chatID
    }

    func disconnect(from chatID: UUID) {
        _ = chatID
    }

    func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        _ = chatID
        return AsyncStream { continuation in continuation.finish() }
    }

    func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope> {
        AsyncStream { continuation in continuation.finish() }
    }

    func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState> {
        AsyncStream { continuation in
            continuation.yield(.connected)
            continuation.finish()
        }
    }

    func sendMessage(
        chatID _: UUID,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        clientMessageID: UUID
    ) async throws -> Message {
        _ = kind
        _ = mediaID
        lock.lock()
        let next = outcomes.isEmpty ? Result<Message, Error>.failure(AppError.unknown) : outcomes.removeFirst()
        lock.unlock()
        switch next {
        case let .success(message):
            return Message(
                id: message.id,
                localID: clientMessageID,
                authorID: message.authorID,
                authorName: message.authorName,
                kind: message.kind,
                text: text ?? message.text,
                mediaID: message.mediaID,
                createdAt: message.createdAt,
                status: message.status,
                attachments: message.attachments
            )
        case let .failure(error):
            throw error
        }
    }

    func setTyping(chatID: UUID, isTyping: Bool) async {
        _ = chatID
        _ = isTyping
    }

    func markRead(chatID: UUID, messageID: UUID) async {
        _ = chatID
        _ = messageID
    }
}

struct ChatNetworkingStub: ChatNetworking {
    func listChats(searchQuery: String?) async throws -> [ServerChat] {
        _ = searchQuery
        return []
    }

    func createChat(title: String, participantContacts: [String]) async throws -> ServerChat {
        _ = title
        _ = participantContacts
        throw AppError.unknown
    }

    func deleteChat(chatID: UUID) async throws {
        _ = chatID
    }

    func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage] {
        _ = chatID
        _ = limit
        _ = messageID
        return []
    }

    func sendMessage(chatID: UUID, kind: Message.Kind, text: String?, mediaID: UUID?, localID: UUID) async throws -> ServerMessage {
        _ = chatID
        _ = kind
        _ = text
        _ = mediaID
        _ = localID
        throw AppError.unknown
    }

    func editMessage(chatID: UUID, messageID: UUID, text: String) async throws -> ServerMessage {
        _ = chatID
        _ = messageID
        _ = text
        throw AppError.unknown
    }

    func deleteMessage(chatID: UUID, messageID: UUID) async throws -> ServerMessage {
        _ = chatID
        _ = messageID
        throw AppError.unknown
    }

    func markRead(chatID: UUID, messageID: UUID) async throws {
        _ = chatID
        _ = messageID
    }

    func setTyping(chatID: UUID, isTyping: Bool) async throws {
        _ = chatID
        _ = isTyping
    }

    func requestUploadURL(mimeType: String, sizeBytes: Int, width: Int?, height: Int?) async throws -> MediaUploadTarget {
        _ = mimeType
        _ = sizeBytes
        _ = width
        _ = height
        throw AppError.unknown
    }

    func uploadImage(to uploadURL: URL, data: Data, mimeType: String) async throws -> String? {
        _ = uploadURL
        _ = data
        _ = mimeType
        return nil
    }

    func confirmUpload(mediaID: UUID, etag: String?) async throws {
        _ = mediaID
        _ = etag
    }
}

final class ContactsServiceStub: ContactsNetworking {
    var contacts: [ContactDTO] = []
    var addContactResult: Result<ContactDTO, Error> = .failure(AppError.unknown)
    var removedContactIDs: [UUID] = []

    func listContacts() async throws -> [ContactDTO] {
        contacts
    }

    func addContact(phone: String) async throws -> ContactDTO {
        _ = phone
        return try addContactResult.get()
    }

    func removeContact(id: UUID) async throws {
        removedContactIDs.append(id)
        contacts.removeAll { $0.id == id }
    }
}

final class LocationServiceStub: LocationNetworking {
    var myLocation = ServerMyLocationShare(
        sharingEnabled: false,
        latitude: nil,
        longitude: nil,
        accuracy: nil,
        updatedAt: nil
    )
    var updatedLocationResult = ServerMyLocationShare(
        sharingEnabled: true,
        latitude: 53.9,
        longitude: 27.56,
        accuracy: 25,
        updatedAt: "2026-05-02T09:00:00.000Z"
    )
    var sharingPermissions: [ServerLocationPermission] = []
    var contactLocations: [ServerSharedLocation] = []
    var updateLocationCallCount = 0
    var stopSharingCallCount = 0

    func fetchMyLocation() async throws -> ServerMyLocationShare {
        myLocation
    }

    func fetchSharingPermissions() async throws -> [ServerLocationPermission] {
        sharingPermissions
    }

    func updateMyLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        sharingEnabled: Bool
    ) async throws -> ServerMyLocationShare {
        updateLocationCallCount += 1
        _ = latitude
        _ = longitude
        _ = accuracy
        _ = sharingEnabled
        myLocation = updatedLocationResult
        return updatedLocationResult
    }

    func stopSharing() async throws {
        stopSharingCallCount += 1
        myLocation = ServerMyLocationShare(
            sharingEnabled: false,
            latitude: nil,
            longitude: nil,
            accuracy: nil,
            updatedAt: nil
        )
    }

    func fetchContactLocations() async throws -> [ServerSharedLocation] {
        contactLocations
    }
}

enum ServerSharedLocationStub {
    static func make(
        userID: UUID,
        displayName: String,
        phone: String,
        latitude: Double = 53.9,
        longitude: Double = 27.56,
        accuracy: Double? = 25,
        updatedAt: String = "2026-05-02T09:00:00.000Z",
        isOutdated: Bool = false
    ) -> ServerSharedLocation {
        let payload: [String: Any] = [
            "userID": userID.uuidString,
            "displayName": displayName,
            "phone": phone,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": accuracy as Any,
            "updatedAt": updatedAt,
            "isOutdated": isOutdated,
        ]
        let data = try! JSONSerialization.data(withJSONObject: payload)
        return try! JSONDecoder().decode(ServerSharedLocation.self, from: data)
    }
}

struct ReachabilityServiceStub: ReachabilityService {
    let isReachable: Bool

    func observe() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            continuation.yield(isReachable)
        }
    }
}

struct AnalyticsServiceSpy: AnalyticsService {
    func track(event _: AppAnalyticsEvent) {}
    func track(error _: Error, context _: String) {}
}

actor AuthServiceSpy: AuthNetworking {
    var lastTelegramPairingPhone: String?
    var lastRequestCodeInput: (method: AuthMethod, contact: String)?
    var lastVerifyCodeInput: (method: AuthMethod, contact: String, code: String)?
    var lastSignInInput: (method: AuthMethod, contact: String, password: String)?

    func requestTelegramPairing(phone: String) async throws -> TelegramPairingResponse {
        lastTelegramPairingPhone = phone
        return TelegramPairingResponse(
            botUsername: "mobile_demo_bot",
            telegramStartUrl: "https://t.me/mobile_demo_bot?start=secure-pair-token",
            expiresIn: 600
        )
    }

    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse {
        lastRequestCodeInput = (method, contact)
        return AuthCodeResponse(status: "code_sent", delivery: "telegram", resendAfterSeconds: 60, expiresIn: 300, debugCode: nil)
    }

    func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        lastVerifyCodeInput = (method, contact, code)
        return AuthVerifyResponse(
            token: "test-token",
            userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            displayName: "Анна Demo"
        )
    }

    func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse {
        lastSignInInput = (method, contact, password)
        return AuthVerifyResponse(
            token: "test-token",
            userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            displayName: "Анна Demo"
        )
    }
}

final class InMemoryTokenStore: TokenStore {
    private var token: String?

    func store(token: String) {
        self.token = token
    }

    func retrieveToken() -> String? {
        token
    }

    func clear() {
        token = nil
    }
}

extension ISO8601DateFormatter {
    static let basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
