import Foundation

protocol RealtimeSocketTask: AnyObject, Sendable {
    func resume()
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
    func send(_ message: URLSessionWebSocketTask.Message) async throws
    func receive() async throws -> URLSessionWebSocketTask.Message
    func sendPing() async throws
}

final class URLSessionRealtimeSocketTask: RealtimeSocketTask, @unchecked Sendable {
    private let task: URLSessionWebSocketTask

    init(task: URLSessionWebSocketTask) {
        self.task = task
    }

    func resume() {
        task.resume()
    }

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        task.cancel(with: closeCode, reason: reason)
    }

    func send(_ message: URLSessionWebSocketTask.Message) async throws {
        try await task.send(message)
    }

    func receive() async throws -> URLSessionWebSocketTask.Message {
        try await task.receive()
    }

    func sendPing() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            task.sendPing { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }
}

public final class DefaultChatRealtimeService: ChatRealtimeService, @unchecked Sendable {
    private let websocketURL: URL
    private let authTokenProvider: @Sendable () async -> String?
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let featureFlags: FeatureFlags
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let socketFactory: @Sendable (URLRequest) -> RealtimeSocketTask
    private let sleep: @Sendable (UInt64) async -> Void
    private let maxReconnectDelay: TimeInterval
    private let heartbeatInterval: TimeInterval

    private let stateQueue = DispatchQueue(label: "realtime.state.queue")
    private var state: ChatRealtimeConnectionState = .disconnected
    private var shouldMaintainConnection = false
    private var reconnectAllowed = true
    private var subscribedChats: [UUID: Int] = [:]
    private var eventContinuations: [UUID: [UUID: AsyncStream<ChatRealtimeEvent>.Continuation]] = [:]
    private var globalEventContinuations: [UUID: AsyncStream<ChatRealtimeEnvelope>.Continuation] = [:]
    private var stateContinuations: [UUID: AsyncStream<ChatRealtimeConnectionState>.Continuation] = [:]
    private var connectionTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var socket: RealtimeSocketTask?
    private var pendingSends: [UUID: CheckedContinuation<Message, Error>] = [:]
    private var connectionGeneration: UInt64 = 0

    init(
        websocketURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?,
        analytics: AnalyticsService,
        reachability: ReachabilityService,
        featureFlags: FeatureFlags,
        maxReconnectDelay: TimeInterval = 15,
        heartbeatInterval: TimeInterval = 15,
        sleep: @escaping @Sendable (UInt64) async -> Void = { nanoseconds in
            try? await Task.sleep(nanoseconds: nanoseconds)
        },
        socketFactory: (@Sendable (URLRequest) -> RealtimeSocketTask)? = nil
    ) {
        self.websocketURL = websocketURL
        self.authTokenProvider = authTokenProvider
        self.analytics = analytics
        self.reachability = reachability
        self.featureFlags = featureFlags
        self.maxReconnectDelay = maxReconnectDelay
        self.heartbeatInterval = heartbeatInterval
        self.sleep = sleep
        self.socketFactory = socketFactory ?? { request in
            URLSessionRealtimeSocketTask(task: session.webSocketTask(with: request))
        }

        self.decoder = .mobileMessengerISO8601()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder
    }

    public func activate() {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            guard connectionTask == nil else {
                reconnectAllowed = true
                shouldMaintainConnection = true
                return
            }
            connectionGeneration &+= 1
            reconnectAllowed = true
            shouldMaintainConnection = true
            startConnectionIfNeeded(retry: 0, generation: connectionGeneration)
        }
    }

    public func deactivate() {
        stateQueue.async { [weak self] in
            self?.stopConnection(manual: true, reason: nil)
        }
    }

    public func handleLogout() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            subscribedChats.removeAll()
            eventContinuations.values
                .flatMap(\.values)
                .forEach { $0.finish() }
            eventContinuations.removeAll()
            stopConnection(manual: true, reason: AppError.unauthorized)
        }
    }

    public func connect(to chatID: UUID) {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            subscribedChats[chatID, default: 0] += 1
        }
    }

    public func disconnect(from chatID: UUID) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            let remainingSubscriptions = max((subscribedChats[chatID] ?? 0) - 1, 0)
            if remainingSubscriptions > 0 {
                subscribedChats[chatID] = remainingSubscriptions
                return
            }
            subscribedChats[chatID] = nil
            eventContinuations.removeValue(forKey: chatID)?.values.forEach { $0.finish() }

            guard subscribedChats.isEmpty, !shouldMaintainConnection else { return }
            stopConnection(manual: true, reason: nil)
        }
    }

    public func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        AsyncStream { continuation in
            let token = UUID()
            stateQueue.async { [weak self] in
                self?.eventContinuations[chatID, default: [:]][token] = continuation
            }
            continuation.onTermination = { [weak self] _ in
                self?.stateQueue.async {
                    self?.eventContinuations[chatID]?[token] = nil
                    if self?.eventContinuations[chatID]?.isEmpty == true {
                        self?.eventContinuations[chatID] = nil
                    }
                }
            }
        }
    }

    public func observeAllEvents() -> AsyncStream<ChatRealtimeEnvelope> {
        AsyncStream { continuation in
            let id = UUID()
            stateQueue.async { [weak self] in
                self?.globalEventContinuations[id] = continuation
            }
            continuation.onTermination = { [weak self] _ in
                self?.stateQueue.async {
                    self?.globalEventContinuations[id] = nil
                }
            }
        }
    }

    public func observeConnectionState() -> AsyncStream<ChatRealtimeConnectionState> {
        AsyncStream { continuation in
            let id = UUID()
            stateQueue.async { [weak self] in
                guard let self else { return }
                stateContinuations[id] = continuation
                continuation.yield(state)
            }
            continuation.onTermination = { [weak self] _ in
                self?.stateQueue.async {
                    self?.stateContinuations[id] = nil
                }
            }
        }
    }

    public func sendMessage(
        chatID: UUID,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        clientMessageID: UUID
    ) async throws -> Message {
        guard featureFlags.isRealtimeEnabled else {
            throw AppError.network(description: "Realtime disabled")
        }

        guard await currentState() == .connected else {
            throw AppError.network(description: "WebSocket disconnected")
        }

        let payload = OutgoingSendMessage(
            chatID: chatID,
            clientMessageId: clientMessageID,
            kind: kind,
            text: text,
            mediaID: mediaID
        )

        return try await withCheckedThrowingContinuation { continuation in
            stateQueue.async { [weak self] in
                guard let self else {
                    continuation.resume(throwing: AppError.unknown)
                    return
                }

                self.pendingSends[clientMessageID] = continuation
                guard let socket = self.socket else {
                    self.pendingSends.removeValue(forKey: clientMessageID)
                    continuation.resume(
                        throwing: AppError.network(description: "WebSocket disconnected")
                    )
                    return
                }

                Task { [weak self] in
                    guard let self else { return }
                    do {
                        try await self.send(
                            event: "message.send",
                            payload: payload,
                            over: socket
                        )
                    } catch {
                        self.failPendingSend(
                            clientMessageID: clientMessageID,
                            error: error
                        )
                    }
                }
            }
        }
    }

    public func setTyping(chatID: UUID, isTyping: Bool) async {
        let payload = OutgoingChatTarget(chatID: chatID)
        let event = isTyping ? "typing.started" : "typing.stopped"
        await sendFireAndForget(event: event, payload: payload)
    }

    public func markRead(chatID: UUID, messageID: UUID) async {
        await sendFireAndForget(
            event: "message.read",
            payload: OutgoingRead(chatID: chatID, messageID: messageID)
        )
    }

    private func startConnectionIfNeeded(retry: Int, generation: UInt64) {
        guard connectionTask == nil else { return }
        setState(retry == 0 ? .connecting(retry: retry) : .reconnecting(retry: retry))
        connectionTask = Task { [weak self] in
            await self?.runConnectionLoop(retry: retry, generation: generation)
        }
    }

    private func runConnectionLoop(retry: Int, generation: UInt64) async {
        guard isCurrentGeneration(generation) else { return }

        guard let token = await authTokenProvider() else {
            stateQueue.async { [weak self] in
                guard let self, self.connectionGeneration == generation else { return }
                self.connectionTask = nil
                self.setState(.failed(reason: AppError.unauthorized.localizedDescription))
            }
            return
        }

        guard reachability.isReachable else {
            stateQueue.async { [weak self] in
                guard let self, self.connectionGeneration == generation else { return }
                self.setState(.reconnecting(retry: retry + 1))
            }
            await scheduleReconnect(after: retry, generation: generation)
            return
        }

        do {
            var request = URLRequest(url: websocketURL)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let currentSocket = socketFactory(request)
            stateQueue.async { [weak self] in
                guard let self, self.connectionGeneration == generation else {
                    currentSocket.cancel(with: .normalClosure, reason: nil)
                    return
                }
                self.socket = currentSocket
            }
            currentSocket.resume()

            while !Task.isCancelled {
                let message = try await currentSocket.receive()
                guard isCurrentGeneration(generation) else { return }
                try await handle(message: message, generation: generation)
            }
        } catch {
            guard !Task.isCancelled else {
                clearConnection(generation: generation)
                return
            }
            guard isCurrentGeneration(generation) else { return }

            analytics.track(error: error, context: "websocket_connect")
            broadcast(event: .disconnected(error))
            failAllPendingSends(with: error)
            stateQueue.async { [weak self] in
                guard let self, self.connectionGeneration == generation else { return }
                self.setState(.reconnecting(retry: retry + 1))
            }
            await scheduleReconnect(after: retry, generation: generation)
            return
        }

        clearConnection(generation: generation)
    }

    private func handle(message: URLSessionWebSocketTask.Message, generation: UInt64) async throws {
        guard isCurrentGeneration(generation) else { return }
        switch message {
        case .string(let text):
            try handle(text: text, generation: generation)
        case .data(let data):
            guard let text = String(data: data, encoding: .utf8) else { return }
            try handle(text: text, generation: generation)
        @unknown default:
            break
        }
    }

    private func handle(text: String, generation: UInt64) throws {
        guard isCurrentGeneration(generation) else { return }
        guard let data = text.data(using: .utf8),
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = payload["event"] as? String else {
            return
        }

        let eventDataObject = payload["data"] ?? [:]
        let eventData = try JSONSerialization.data(withJSONObject: normalizedJSONObject(eventDataObject))

        switch event {
        case "connection.ready":
            stateQueue.async { [weak self] in
                guard let self, self.connectionGeneration == generation else { return }
                self.setState(.connected)
            }
            startHeartbeat()
            broadcast(event: .connected)
        case "chat.created":
            let payload = try decoder.decode(ChatCreatedEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .chatCreated(try payload.chat.asDomainChat()))
        case "chat.deleted":
            let payload = try decoder.decode(ChatDeletedEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .chatDeleted)
        case "message.created":
            let payload = try decoder.decode(MessageCreatedEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .message(payload.message.asDomainMessage()))
        case "message.updated":
            let payload = try decoder.decode(MessageCreatedEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .messageUpdated(payload.message.asDomainMessage()))
        case "message.deleted":
            let payload = try decoder.decode(MessageCreatedEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .messageDeleted(payload.message.asDomainMessage()))
        case "message.read":
            let payload = try decoder.decode(MessageReadEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .messageRead(messageID: payload.messageID))
        case "typing.started", "typing.stopped":
            let payload = try decoder.decode(TypingEvent.self, from: eventData)
            deliver(chatID: payload.chatID, event: .typing(participants: payload.typingParticipants))
        case "message.send.ack":
            let payload = try decoder.decode(MessageAckEvent.self, from: eventData)
            resolvePendingSend(clientMessageID: payload.clientMessageId, message: payload.message)
        case "message.failed":
            let payload = try decoder.decode(MessageFailedEvent.self, from: eventData)
            failPendingSend(
                clientMessageID: payload.clientMessageId,
                error: AppError.network(description: payload.reason)
            )
        default:
            break
        }
    }

    private func normalizedJSONObject(_ value: Any) -> Any {
        if value is NSNull {
            return [:]
        }
        return value
    }

    private func deliver(chatID: UUID, event: ChatRealtimeEvent) {
        stateQueue.async { [weak self] in
            self?.globalEventContinuations.values.forEach { continuation in
                continuation.yield(ChatRealtimeEnvelope(chatID: chatID, event: event))
            }
            guard self?.subscribedChats[chatID] != nil else { return }
            self?.eventContinuations[chatID]?.values.forEach { $0.yield(event) }
        }
    }

    private func broadcast(event: ChatRealtimeEvent) {
        stateQueue.async { [weak self] in
            self?.eventContinuations.values
                .flatMap(\.values)
                .forEach { $0.yield(event) }
        }
    }

    private func sendFireAndForget<Payload: Encodable>(event: String, payload: Payload) async {
        guard await currentState() == .connected else { return }
        guard let currentSocket = stateQueue.sync(execute: { socket }) else { return }

        do {
            try await send(event: event, payload: payload, over: currentSocket)
        } catch {
            analytics.track(error: error, context: "websocket_send_\(event)")
        }
    }

    private func send<Payload: Encodable>(
        event: String,
        payload: Payload,
        over socket: RealtimeSocketTask
    ) async throws {
        let data = try encoder.encode(SocketEnvelope(event: event, data: payload))
        guard let string = String(data: data, encoding: .utf8) else {
            throw AppError.network(description: "Invalid websocket payload")
        }
        try await socket.send(.string(string))
    }

    private func scheduleReconnect(after retry: Int, generation: UInt64) async {
        clearSocketReference(generation: generation)
        let delay = UInt64(backoff(for: retry) * 1_000_000_000)
        await sleep(delay)
        guard isCurrentGeneration(generation) else { return }
        guard shouldReconnect else {
            clearConnection(generation: generation)
            return
        }
        await runConnectionLoop(retry: retry + 1, generation: generation)
    }

    private func stopConnection(manual: Bool, reason: Error?) {
        connectionGeneration &+= 1
        reconnectAllowed = false
        shouldMaintainConnection = false
        cancelHeartbeat()
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        connectionTask?.cancel()
        connectionTask = nil
        failAllPendingSends(with: reason ?? AppError.network(description: "WebSocket disconnected"))
        broadcast(event: .disconnected(reason))
        if manual {
            setState(.disconnected)
        }
    }

    private func clearConnection(generation: UInt64) {
        stateQueue.async { [weak self] in
            guard let self, self.connectionGeneration == generation else { return }
            self.cancelHeartbeat()
            self.socket = nil
            self.connectionTask = nil
            self.setState(.disconnected)
        }
    }

    private func clearSocketReference(generation: UInt64) {
        stateQueue.async { [weak self] in
            guard let self, self.connectionGeneration == generation else { return }
            self.cancelHeartbeat()
            self.socket = nil
        }
    }

    private func resolvePendingSend(clientMessageID: UUID, message: ServerMessage) {
        stateQueue.async { [weak self] in
            guard let continuation = self?.pendingSends.removeValue(forKey: clientMessageID) else { return }
            continuation.resume(
                returning: message
                    .asDomainMessage(localID: clientMessageID)
                    .updatingStatus(.sent)
            )
        }
    }

    private func failPendingSend(clientMessageID: UUID, error: Error) {
        stateQueue.async { [weak self] in
            guard let continuation = self?.pendingSends.removeValue(forKey: clientMessageID) else { return }
            continuation.resume(throwing: error)
        }
    }

    private func failAllPendingSends(with error: Error) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            let continuations = pendingSends.values
            pendingSends.removeAll()
            continuations.forEach { $0.resume(throwing: error) }
        }
    }

    private var shouldReconnect: Bool {
        stateQueue.sync {
            shouldMaintainConnection && reconnectAllowed
        }
    }

    private func isCurrentGeneration(_ generation: UInt64) -> Bool {
        stateQueue.sync { connectionGeneration == generation }
    }

    private func currentState() async -> ChatRealtimeConnectionState {
        stateQueue.sync { state }
    }

    private func setState(_ newState: ChatRealtimeConnectionState) {
        state = newState
        stateContinuations.values.forEach { continuation in
            continuation.yield(newState)
        }
    }

    private func backoff(for retry: Int) -> Double {
        min(pow(2.0, Double(retry)), maxReconnectDelay)
    }

    private func startHeartbeat() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            heartbeatTask?.cancel()
            heartbeatTask = Task { [weak self] in
                await self?.runHeartbeatLoop()
            }
        }
    }

    private func cancelHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    private func runHeartbeatLoop() async {
        while !Task.isCancelled {
            let delay = UInt64(heartbeatInterval * 1_000_000_000)
            await sleep(delay)
            guard !Task.isCancelled else { return }

            guard await currentState() == .connected else { continue }
            guard let currentSocket = stateQueue.sync(execute: { socket }) else { continue }

            do {
                try await currentSocket.sendPing()
            } catch {
                analytics.track(error: error, context: "websocket_ping")
                currentSocket.cancel(with: .goingAway, reason: nil)
                break
            }
        }
    }
}

private struct SocketEnvelope<Payload: Encodable>: Encodable {
    let event: String
    let data: Payload
}

private struct OutgoingSendMessage: Encodable {
    let chatID: UUID
    let clientMessageId: UUID
    let kind: Message.Kind
    let text: String?
    let mediaID: UUID?
}

private struct OutgoingChatTarget: Encodable {
    let chatID: UUID
}

private struct OutgoingRead: Encodable {
    let chatID: UUID
    let messageID: UUID
}

private struct ChatCreatedEvent: Decodable {
    let chatID: UUID
    let chat: ServerChat
}

private struct ChatDeletedEvent: Decodable {
    let chatID: UUID
}

private struct MessageCreatedEvent: Decodable {
    let chatID: UUID
    let message: ServerMessage
}

private struct MessageReadEvent: Decodable {
    let chatID: UUID
    let messageID: UUID
}

private struct TypingEvent: Decodable {
    let chatID: UUID
    let typingParticipants: [String]
}

private struct MessageAckEvent: Decodable {
    let chatID: UUID
    let clientMessageId: UUID
    let message: ServerMessage
}

private struct MessageFailedEvent: Decodable {
    let chatID: UUID
    let clientMessageId: UUID
    let reason: String
}
