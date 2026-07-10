@testable import MobileMessengerIOS
import XCTest

@MainActor
final class RealtimeServiceTests: XCTestCase {
    func testWebSocketEventDecodingWorks() async {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        let chatID = UUID()

        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        socket.enqueue(text: #"{"event":"typing.started","data":{"chatID":"\#(chatID.uuidString)","userID":"11111111-2222-3333-4444-555555555555","displayName":"Анна","isTyping":true,"typingParticipants":["Анна"]}}"#)

        let stream = service.observeAllEvents()
        service.activate()

        let envelope = await nextEnvelope(from: stream)
        if case let .typing(participants) = envelope?.event {
            XCTAssertEqual(envelope?.chatID, chatID)
            XCTAssertEqual(participants, ["Анна"])
        } else {
            XCTFail("Expected typing event")
        }
    }

    func testMessageCreatedDecodeWorks() async {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        let chatID = UUID()
        let serverID = UUID()
        let clientMessageID = UUID()

        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        socket.enqueue(text: #"{"event":"message.created","data":{"chatID":"\#(chatID.uuidString)","message":{"id":"\#(serverID.uuidString)","messageID":"\#(clientMessageID.uuidString)","chatID":"\#(chatID.uuidString)","authorID":"11111111-2222-3333-4444-555555555555","authorName":"Анна Demo","kind":"text","text":"Привет","mediaID":null,"mediaURL":null,"status":"delivered","createdAt":"2026-04-24T12:00:00.000Z"}}}"#)

        let stream = service.observeAllEvents()
        service.activate()

        let envelope = await nextEnvelope(from: stream)
        guard case let .message(message)? = envelope?.event else {
            return XCTFail("Expected message event")
        }

        XCTAssertEqual(message.id.chatID, chatID)
        XCTAssertEqual(message.id.messageID, serverID)
        XCTAssertEqual(message.localID, clientMessageID)
        XCTAssertEqual(message.text, "Привет")
    }

    func testMessageAckMarksPendingMessageSent() async throws {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        let chatID = UUID()
        let serverID = UUID()
        let clientMessageID = UUID()

        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        let sendTask = Task {
            try await service.sendMessage(
                chatID: chatID,
                kind: .text,
                text: "Привет",
                mediaID: nil,
                clientMessageID: clientMessageID
            )
        }

        socket.enqueue(text: #"{"event":"message.send.ack","data":{"chatID":"\#(chatID.uuidString)","clientMessageId":"\#(clientMessageID.uuidString)","message":{"id":"\#(serverID.uuidString)","messageID":"\#(clientMessageID.uuidString)","chatID":"\#(chatID.uuidString)","authorID":"11111111-2222-3333-4444-555555555555","authorName":"Анна Demo","kind":"text","text":"Привет","mediaID":null,"mediaURL":null,"status":"delivered","createdAt":"2026-04-24T12:00:00.000Z"}}}"#)

        let message = try await sendTask.value
        XCTAssertEqual(message.id.messageID, serverID)
        XCTAssertEqual(message.localID, clientMessageID)
        XCTAssertEqual(message.status, .sent)
    }

    func testLogoutClosesRealtimeConnection() async {
        let socket = FakeRealtimeSocketTask()
        let service = makeRealtimeService(socket: socket)
        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        service.handleLogout()
        let cancelCount = await waitForCancelCount(on: socket)
        XCTAssertEqual(cancelCount, 1)
    }

    func testManualDisconnectDoesNotReconnect() async {
        let socket = FakeRealtimeSocketTask()
        var factoryCalls = 0
        let service = makeRealtimeService(socket: socket) { request in
            _ = request
            factoryCalls += 1
            return socket
        }
        socket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        service.deactivate()
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(factoryCalls, 1)
    }

    func testLogoutPreventsReconnectAndStaleSocketReuse() async throws {
        let firstSocket = FakeRealtimeSocketTask()
        let secondSocket = FakeRealtimeSocketTask()
        var factoryCalls = 0
        let service = try DefaultChatRealtimeService(
            websocketURL: XCTUnwrap(URL(string: "ws://localhost/realtime")),
            authTokenProvider: { "test-token" },
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: true,
                isMediaEnabled: true,
                isLoggingVerbose: false
            ),
            maxReconnectDelay: 0.01,
            heartbeatInterval: 10,
            sleep: { nanoseconds in
                try? await Task.sleep(nanoseconds: min(nanoseconds, 20_000_000))
            },
            socketFactory: { _ in
                defer { factoryCalls += 1 }
                return factoryCalls == 0 ? firstSocket : secondSocket
            }
        )

        firstSocket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)
        service.activate()
        _ = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state { return true }
            return false
        })

        service.handleLogout()
        firstSocket.enqueue(error: AppError.network(description: "late disconnect"))
        try? await Task.sleep(nanoseconds: 200_000_000)
        let firstCancelCount = await firstSocket.cancelCount
        let secondCancelCount = await secondSocket.cancelCount

        XCTAssertEqual(factoryCalls, 1)
        XCTAssertEqual(firstCancelCount, 1)
        XCTAssertEqual(secondCancelCount, 0)
    }

    func testPingFailureTriggersReconnect() async throws {
        let firstSocket = FakeRealtimeSocketTask()
        firstSocket.pingError = AppError.network(description: "Ping failed")
        let secondSocket = FakeRealtimeSocketTask()
        secondSocket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        var factoryCalls = 0
        let service = try DefaultChatRealtimeService(
            websocketURL: XCTUnwrap(URL(string: "ws://localhost/realtime")),
            authTokenProvider: { "test-token" },
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: true,
                isMediaEnabled: true,
                isLoggingVerbose: false
            ),
            maxReconnectDelay: 0.01,
            heartbeatInterval: 0.01,
            sleep: { nanoseconds in
                try? await Task.sleep(nanoseconds: min(nanoseconds, 20_000_000))
            },
            socketFactory: { _ in
                defer { factoryCalls += 1 }
                return factoryCalls == 0 ? firstSocket : secondSocket
            }
        )

        firstSocket.enqueue(text: #"{"event":"connection.ready","data":{"userID":"11111111-2222-3333-4444-555555555555"}}"#)

        service.activate()
        let reconnectedState = await nextState(from: service.observeConnectionState(), matching: { state in
            if case .connected = state, factoryCalls >= 2 {
                return true
            }
            return false
        })

        XCTAssertNotNil(reconnectedState)
        XCTAssertGreaterThanOrEqual(factoryCalls, 2)
    }

    private func makeRealtimeService(
        socket: FakeRealtimeSocketTask,
        factory: (@Sendable (URLRequest) -> RealtimeSocketTask)? = nil
    ) -> DefaultChatRealtimeService {
        DefaultChatRealtimeService(
            websocketURL: URL(string: "ws://localhost/realtime")!,
            authTokenProvider: { "test-token" },
            analytics: AnalyticsServiceSpy(),
            reachability: ReachabilityServiceStub(isReachable: true),
            featureFlags: FeatureFlags(
                isRealtimeEnabled: true,
                isPushEnabled: true,
                isMediaEnabled: true,
                isLoggingVerbose: false
            ),
            sleep: { _ in },
            socketFactory: factory ?? { _ in socket }
        )
    }

    private func nextEnvelope(
        from stream: AsyncStream<ChatRealtimeEnvelope>
    ) async -> ChatRealtimeEnvelope? {
        var iterator = stream.makeAsyncIterator()
        while let value = await iterator.next() {
            switch value.event {
            case .chatCreated, .chatDeleted:
                continue
            case .connected, .disconnected:
                continue
            case .message, .messageUpdated, .messageDeleted, .messageRead, .typing:
                return value
            }
        }
        return nil
    }

    private func nextState(
        from stream: AsyncStream<ChatRealtimeConnectionState>,
        matching predicate: @escaping (ChatRealtimeConnectionState) -> Bool
    ) async -> ChatRealtimeConnectionState? {
        var iterator = stream.makeAsyncIterator()
        while let state = await iterator.next() {
            if predicate(state) {
                return state
            }
        }
        return nil
    }

    private func waitForCancelCount(on socket: FakeRealtimeSocketTask) async -> Int {
        for _ in 0 ..< 20 {
            let count = await socket.cancelCount
            if count > 0 {
                return count
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return await socket.cancelCount
    }
}

