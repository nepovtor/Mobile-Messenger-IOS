import Foundation
import XCTest
@testable import MobileMessengerIOS

final class MobileMessengerIOSTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    func testRequestCodeDecodesSuccessfulResponse() async throws {
        let session = makeURLSession()
        let service = RESTAuthService(
            baseURL: URL(string: "http://localhost/api")!,
            session: session
        )

        MockURLProtocol.enqueue(
            statusCode: 200,
            body: #"{"expiresIn":300}"#.data(using: .utf8)!
        )

        let response = try await service.requestCode(method: .phone, contact: "+15551230011")

        XCTAssertEqual(response?.expiresIn, 300)
    }

    func testVerifyCodeDecodesSuccessfulResponse() async throws {
        let session = makeURLSession()
        let service = RESTAuthService(
            baseURL: URL(string: "http://localhost/api")!,
            session: session
        )
        let userID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!

        MockURLProtocol.enqueue(
            statusCode: 200,
            body: """
            {
              "token": "token-123",
              "userID": "\(userID.uuidString)",
              "displayName": "Анна Demo"
            }
            """.data(using: .utf8)!
        )

        let response = try await service.verifyCode(
            method: .phone,
            contact: "+15551230011",
            code: "123456"
        )

        XCTAssertEqual(response.token, "token-123")
        XCTAssertEqual(response.userID, userID)
        XCTAssertEqual(response.displayName, "Анна Demo")
    }

    func testAuthServiceMapsBackendError() async {
        let session = makeURLSession()
        let service = RESTAuthService(
            baseURL: URL(string: "http://localhost/api")!,
            session: session
        )

        MockURLProtocol.enqueue(
            statusCode: 401,
            body: #"{"message":"Invalid or expired code"}"#.data(using: .utf8)!
        )

        do {
            _ = try await service.verifyCode(method: .phone, contact: "+15551230011", code: "0000")
            XCTFail("Expected backend error")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Invalid or expired code")
        }
    }

    @MainActor
    func testSessionStorePersistsTokenAndUserIDThroughTokenStore() {
        let defaults = UserDefaults(suiteName: "SessionStoreTests.\(UUID().uuidString)")!
        let tokenStore = InMemoryTokenStore()
        let userID = UUID()
        let session = AuthenticatedSession(
            accessToken: "secure-token",
            userID: userID,
            displayName: "Вера"
        )

        let store = SessionStore(tokenStore: tokenStore, defaults: defaults)
        store.authenticate(with: session)

        XCTAssertEqual(tokenStore.getAccessToken(), "secure-token")
        XCTAssertEqual(store.authToken, "secure-token")

        let restored = SessionStore(tokenStore: tokenStore, defaults: defaults)
        guard case .authenticated(let token, let restoredUserID, let displayName) = restored.state else {
            return XCTFail("Expected authenticated state")
        }

        XCTAssertEqual(token, "secure-token")
        XCTAssertEqual(restoredUserID, userID)
        XCTAssertEqual(displayName, "Вера")
    }

    @MainActor
    func testAuthViewModelStoresAuthenticatedSessionFromMockAuthRepository() async {
        let userID = UUID()
        let authRepository = MockAuthRepository(
            signInResponse: AuthVerifyResponse(
                token: "mock-token",
                userID: userID,
                displayName: "Mock User"
            )
        )
        let sessionStore = SessionStore(
            tokenStore: InMemoryTokenStore(),
            defaults: UserDefaults(suiteName: "AuthViewModelTests.\(UUID().uuidString)")!
        )
        let viewModel = AuthViewModel(authService: authRepository, sessionStore: sessionStore)
        viewModel.contact = "+15551230011"
        viewModel.password = "demo1111"

        await viewModel.signInWithPassword()

        XCTAssertEqual(authRepository.signInCalls.count, 1)
        guard case .authenticated(let token, let restoredUserID, let displayName) = sessionStore.state else {
            return XCTFail("Expected authenticated state")
        }
        XCTAssertEqual(token, "mock-token")
        XCTAssertEqual(restoredUserID, userID)
        XCTAssertEqual(displayName, "Mock User")
    }

    func testServerMessageMapsToDomainMessage() throws {
        let messageID = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        let chatID = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!
        let authorID = UUID(uuidString: "44444444-4444-4444-4444-444444444444")!
        let payload = """
        {
          "id": "55555555-5555-5555-5555-555555555555",
          "messageID": "\(messageID.uuidString)",
          "chatID": "\(chatID.uuidString)",
          "authorID": "\(authorID.uuidString)",
          "authorName": "Алиса",
          "kind": "image",
          "text": "Фото",
          "mediaID": "66666666-6666-6666-6666-666666666666",
          "mediaURL": "https://example.com/image.jpg",
          "status": "delivered",
          "createdAt": "2026-04-18T20:44:53.671Z"
        }
        """.data(using: .utf8)!

        let message = try makeChatDecoder().decode(ServerMessage.self, from: payload).asDomainMessage()

        XCTAssertEqual(message.id.chatID, chatID)
        XCTAssertEqual(message.id.messageID, messageID)
        XCTAssertEqual(message.authorID, authorID)
        XCTAssertEqual(message.kind, .image)
        XCTAssertEqual(message.text, "Фото")
        XCTAssertEqual(message.attachments.first?.url?.absoluteString, "https://example.com/image.jpg")
    }

    func testServerChatMapsToDomainChat() throws {
        let payload = """
        {
          "id": "11111111-1111-1111-1111-111111111111",
          "title": "General Chat",
          "lastMessagePreview": "Привет",
          "lastActivity": "2026-04-18T20:44:53.671Z",
          "unreadCount": 2,
          "typingParticipants": ["Анна"],
          "participantNames": ["Анна", "Борис"],
          "participantCount": 3
        }
        """.data(using: .utf8)!

        let chat = try makeChatDecoder().decode(ServerChat.self, from: payload).asDomainChat()

        XCTAssertEqual(chat.title, "General Chat")
        XCTAssertEqual(chat.unreadCount, 2)
        XCTAssertEqual(chat.typingParticipants, ["Анна"])
        XCTAssertEqual(chat.participantCount, 3)
        XCTAssertTrue(chat.isGroup)
    }

    func testAuthVerifyResponseMapsToAuthenticatedSession() {
        let userID = UUID()
        let response = AuthVerifyResponse(token: "token-123", userID: userID, displayName: "Борис")

        let session = response.asAuthenticatedSession()

        XCTAssertEqual(session.accessToken, "token-123")
        XCTAssertEqual(session.userID, userID)
        XCTAssertEqual(session.displayName, "Борис")
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

    func testRealtimeConnectTransitionsToConnectingAndConnected() async throws {
        let streamSource = MockRealtimeStreamSource()
        let stream = MockRealtimeStream()
        streamSource.enqueue(stream.makeEventStream(statusCode: 200))

        let service = makeRealtimeService(streamSource: streamSource)
        let states = service.observeConnectionState()

        service.activate()

        let connecting = try await waitForState(.connecting(retry: 0), from: states)
        XCTAssertEqual(connecting, .connecting(retry: 0))
        let connected = try await waitForState(.connected, from: states)
        XCTAssertEqual(connected, .connected)
    }

    func testRealtimeDisconnectTransitionsToDisconnected() async throws {
        let streamSource = MockRealtimeStreamSource()
        let stream = MockRealtimeStream()
        streamSource.enqueue(stream.makeEventStream(statusCode: 200))

        let service = makeRealtimeService(streamSource: streamSource)
        let states = service.observeConnectionState()

        service.activate()
        _ = try await waitForState(.connected, from: states)

        service.deactivate()

        let disconnected = try await waitForState(.disconnected, from: states)
        XCTAssertEqual(disconnected, .disconnected)
    }

    func testRealtimeFailureTransitionsToReconnecting() async throws {
        let streamSource = MockRealtimeStreamSource()
        streamSource.enqueue(MockRealtimeStream.failing(statusCode: 500))
        let recoveryStream = MockRealtimeStream()
        streamSource.enqueue(recoveryStream.makeEventStream(statusCode: 200))

        let service = makeRealtimeService(streamSource: streamSource)
        let states = service.observeConnectionState()

        service.activate()

        let reconnecting = try await waitForState(.reconnecting(retry: 1), from: states)
        XCTAssertEqual(reconnecting, .reconnecting(retry: 1))
        service.deactivate()
    }

    func testManualDisconnectDoesNotTriggerReconnect() async throws {
        let streamSource = MockRealtimeStreamSource()
        let stream = MockRealtimeStream()
        streamSource.enqueue(stream.makeEventStream(statusCode: 200))

        let service = makeRealtimeService(streamSource: streamSource)
        let states = service.observeConnectionState()

        service.activate()
        _ = try await waitForState(.connected, from: states)
        service.deactivate()
        _ = try await waitForState(.disconnected, from: states)

        try await Task.sleep(nanoseconds: 50_000_000)
        let openCount = streamSource.openCount
        XCTAssertEqual(openCount, 1)
    }

    func testLogoutStopsRealtimeCompletely() async throws {
        let streamSource = MockRealtimeStreamSource()
        let stream = MockRealtimeStream()
        streamSource.enqueue(stream.makeEventStream(statusCode: 200))

        let service = makeRealtimeService(streamSource: streamSource)
        let states = service.observeConnectionState()

        service.activate()
        _ = try await waitForState(.connected, from: states)
        service.handleLogout()

        let disconnected = try await waitForState(.disconnected, from: states)
        XCTAssertEqual(disconnected, .disconnected)
        try await Task.sleep(nanoseconds: 50_000_000)
        let openCount = streamSource.openCount
        XCTAssertEqual(openCount, 1)
    }

    private func makeURLSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    private func makeChatDecoder() -> JSONDecoder {
        let service = RESTChatService(
            baseURL: URL(string: "http://localhost/api")!,
            authTokenProvider: { nil }
        )
        let mirror = Mirror(reflecting: service)
        return mirror.descendant("decoder") as! JSONDecoder
    }

    private func makeRealtimeService(streamSource: MockRealtimeStreamSource) -> DefaultChatRealtimeService {
        DefaultChatRealtimeService(
            baseURL: URL(string: "http://localhost/api")!,
            authTokenProvider: { "token-123" },
            analytics: TestAnalyticsService(),
            reachability: TestReachabilityService(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: false,
                isMediaEnabled: false,
                isLoggingVerbose: false
            ),
            sleep: { _ in },
            streamProvider: { request in
                try streamSource.open(request: request)
            }
        )
    }

    private func waitForState(
        _ expectedState: ChatRealtimeConnectionState,
        from stream: AsyncStream<ChatRealtimeConnectionState>,
        timeout: TimeInterval = 2
    ) async throws -> ChatRealtimeConnectionState {
        let deadline = Date().addingTimeInterval(timeout)
        var iterator = stream.makeAsyncIterator()

        while Date() < deadline {
            if let state = await iterator.next(), state == expectedState {
                return state
            }
        }

        throw XCTSkip("State \(expectedState) was not observed")
    }
}

private final class MockURLProtocol: URLProtocol {
    private static let queue = DispatchQueue(label: "MockURLProtocol.queue")
    private static var responses: [(Int, Data)] = []

    static func reset() {
        queue.sync {
            responses.removeAll()
        }
    }

    static func enqueue(statusCode: Int, body: Data) {
        queue.sync {
            responses.append((statusCode, body))
        }
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let response = Self.queue.sync { Self.responses.removeFirst() }
        let httpResponse = HTTPURLResponse(
            url: request.url!,
            statusCode: response.0,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!

        client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: response.1)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private final class MockRealtimeStreamSource: @unchecked Sendable {
    private let lock = NSLock()
    private var streams: [RealtimeEventStream] = []
    private(set) var openCount = 0

    func enqueue(_ stream: RealtimeEventStream) {
        lock.lock()
        streams.append(stream)
        lock.unlock()
    }

    func open(request: URLRequest) throws -> RealtimeEventStream {
        lock.lock()
        openCount += 1
        guard !streams.isEmpty else {
            lock.unlock()
            throw AppError.network(description: "No mock stream configured")
        }
        let stream = streams.removeFirst()
        lock.unlock()
        return stream
    }
}

private final class MockRealtimeStream {
    private var continuation: AsyncThrowingStream<String, Error>.Continuation?

    func makeEventStream(statusCode: Int) -> RealtimeEventStream {
        let response = HTTPURLResponse(
            url: URL(string: "http://localhost/api/realtime/events")!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "text/event-stream"]
        )!

        let lines = AsyncThrowingStream<String, Error> { continuation in
            self.continuation = continuation
            continuation.yield("event: keepalive")
            continuation.yield(#"data: {"ok":true}"#)
        }

        return RealtimeEventStream(response: response, lines: lines)
    }

    static func failing(statusCode: Int) -> RealtimeEventStream {
        let response = HTTPURLResponse(
            url: URL(string: "http://localhost/api/realtime/events")!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "text/event-stream"]
        )!
        return RealtimeEventStream(
            response: response,
            lines: AsyncThrowingStream { continuation in
                continuation.finish(throwing: URLError(.networkConnectionLost))
            }
        )
    }
}

private final class MockAuthRepository: AuthNetworking, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requestCodeCalls: [(method: AuthMethod, contact: String)] = []
    private(set) var verifyCodeCalls: [(method: AuthMethod, contact: String, code: String)] = []
    private(set) var signInCalls: [(method: AuthMethod, contact: String, password: String)] = []
    private let signInResponse: AuthVerifyResponse

    init(signInResponse: AuthVerifyResponse) {
        self.signInResponse = signInResponse
    }

    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse? {
        lock.lock()
        requestCodeCalls.append((method, contact))
        lock.unlock()
        return AuthCodeResponse(expiresIn: 300)
    }

    func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        lock.lock()
        verifyCodeCalls.append((method, contact, code))
        lock.unlock()
        return signInResponse
    }

    func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse {
        lock.lock()
        signInCalls.append((method, contact, password))
        lock.unlock()
        return signInResponse
    }
}

private final class TestReachabilityService: ReachabilityService, @unchecked Sendable {
    let isReachable: Bool

    init(isReachable: Bool) {
        self.isReachable = isReachable
    }

    func observe() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            continuation.yield(isReachable)
        }
    }
}

private struct TestAnalyticsService: AnalyticsService {
    func track(event: AppAnalyticsEvent) {}
    func track(error: Error, context: String) {}
}
