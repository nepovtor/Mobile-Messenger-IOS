import Foundation

public final class DefaultChatRealtimeService: ChatRealtimeService, @unchecked Sendable {
    private let baseURL: URL
    private let authTokenProvider: @Sendable () async -> String?
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let featureFlags: FeatureFlags
    private let decoder: JSONDecoder
    private let streamProvider: @Sendable (URLRequest) async throws -> RealtimeEventStream
    private let sleep: @Sendable (UInt64) async -> Void
    private let maxReconnectDelay: TimeInterval
    private let heartbeatTimeout: TimeInterval

    private let stateQueue = DispatchQueue(label: "realtime.state.queue")
    private var state: ChatRealtimeConnectionState = .disconnected
    private var shouldMaintainConnection = false
    private var reconnectAllowed = true
    private var isRealtimeTemporarilyDisabled = false
    private var lastHeartbeatAt = Date.distantPast
    private var subscribedChats: Set<UUID> = []
    private var eventContinuations: [UUID: [UUID: AsyncStream<ChatRealtimeEvent>.Continuation]] = [:]
    private var globalEventContinuations: [UUID: AsyncStream<ChatRealtimeEnvelope>.Continuation] = [:]
    private var stateContinuations: [UUID: AsyncStream<ChatRealtimeConnectionState>.Continuation] = [:]
    private var connectionTask: Task<Void, Never>?
    private var heartbeatMonitorTask: Task<Void, Never>?

    init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?,
        analytics: AnalyticsService,
        reachability: ReachabilityService,
        featureFlags: FeatureFlags,
        maxReconnectDelay: TimeInterval = 15,
        heartbeatTimeout: TimeInterval = 45,
        sleep: @escaping @Sendable (UInt64) async -> Void = { nanoseconds in
            try? await Task.sleep(nanoseconds: nanoseconds)
        },
        streamProvider: (@Sendable (URLRequest) async throws -> RealtimeEventStream)? = nil
    ) {
        self.baseURL = baseURL
        self.authTokenProvider = authTokenProvider
        self.analytics = analytics
        self.reachability = reachability
        self.featureFlags = featureFlags
        self.maxReconnectDelay = maxReconnectDelay
        self.heartbeatTimeout = heartbeatTimeout
        self.sleep = sleep
        self.streamProvider = streamProvider ?? { request in
            let (bytes, response) = try await session.bytes(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AppError.network(description: "Некорректный ответ realtime")
            }

            return RealtimeEventStream(
                response: httpResponse,
                lines: AsyncThrowingStream { continuation in
                    Task {
                        do {
                            for try await line in bytes.lines {
                                continuation.yield(line)
                            }
                            continuation.finish()
                        } catch {
                            continuation.finish(throwing: error)
                        }
                    }
                }
            )
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            if let date = Self.fractionalSecondDateFormatter.date(from: value)
                ?? Self.iso8601DateFormatter.date(from: value) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO-8601 date: \(value)"
            )
        }
        self.decoder = decoder
    }

    private static let iso8601DateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fractionalSecondDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    public func activate() {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            isRealtimeTemporarilyDisabled = false
            reconnectAllowed = true
            shouldMaintainConnection = true
            startConnectionIfNeeded(retry: 0)
        }
    }

    public func deactivate() {
        stateQueue.async { [weak self] in
            self?.stopConnection(manual: true, reconnectAllowed: false, broadcastDisconnection: true)
        }
    }

    public func handleLogout() {
        stateQueue.async { [weak self] in
            self?.stopConnection(manual: true, reconnectAllowed: false, broadcastDisconnection: true)
        }
    }

    public func connect(to chatID: UUID) {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            subscribedChats.insert(chatID)
            if shouldMaintainConnection {
                startConnectionIfNeeded(retry: 0)
            }
        }
    }

    public func disconnect(from chatID: UUID) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            subscribedChats.remove(chatID)
            eventContinuations[chatID]?.values.forEach { $0.finish() }
            eventContinuations[chatID] = nil

            guard subscribedChats.isEmpty, !shouldMaintainConnection else { return }
            stopConnection(manual: true, reconnectAllowed: false, broadcastDisconnection: false)
        }
    }

    public func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        AsyncStream { continuation in
            let subscriptionID = UUID()
            stateQueue.async { [weak self] in
                self?.eventContinuations[chatID, default: [:]][subscriptionID] = continuation
            }
            continuation.onTermination = { [weak self] _ in
                self?.stateQueue.async {
                    self?.eventContinuations[chatID]?[subscriptionID] = nil
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

    private func startConnectionIfNeeded(retry: Int) {
        guard connectionTask == nil else { return }
        setState(.connecting(retry: retry))
        connectionTask = Task { [weak self] in
            await self?.runConnectionLoop(retry: retry)
        }
    }

    private func runConnectionLoop(retry: Int) async {
        guard let token = await authTokenProvider() else {
            broadcast(event: .disconnected(AppError.unauthorized))
            stateQueue.async { [weak self] in
                self?.connectionTask = nil
                self?.setState(.failed(reason: AppError.unauthorized.localizedDescription))
            }
            return
        }

        if !reachability.isReachable {
            stateQueue.async { [weak self] in
                self?.setState(.reconnecting(retry: retry + 1))
            }
            await scheduleReconnect(after: retry)
            return
        }

        do {
            var request = try await AuthorizedRequestFactory.makeRequest(
                url: baseURL.appendingPathComponent("realtime/events"),
                method: "GET",
                authTokenProvider: { token }
            )
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

            let stream = try await streamProvider(request)
            if [404, 405, 501].contains(stream.response.statusCode) {
                analytics.track(
                    error: AppError.network(description: "Realtime temporarily unavailable"),
                    context: "sse_unsupported"
                )
                stateQueue.async { [weak self] in
                    self?.disableRealtimeLoop()
                }
                return
            }
            guard 200..<300 ~= stream.response.statusCode else {
                throw AppError.network(description: "Не удалось подключиться к SSE")
            }

            stateQueue.async { [weak self] in
                guard let self else { return }
                lastHeartbeatAt = Date()
                setState(.connected)
                restartHeartbeatMonitor()
            }
            broadcast(event: .connected)

            var currentType = "message"
            var currentData: [String] = []

            for try await line in stream.lines {
                if Task.isCancelled { break }
                recordHeartbeat()

                if line.isEmpty {
                    try handleEvent(type: currentType, data: currentData.joined(separator: "\n"))
                    currentType = "message"
                    currentData = []
                    continue
                }

                if line.hasPrefix("event:") {
                    currentType = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                    continue
                }

                if line.hasPrefix("data:") {
                    currentData.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
                }
            }
        } catch {
            analytics.track(error: error, context: "sse_connect")
            broadcast(event: .disconnected(error))
            stateQueue.async { [weak self] in
                self?.setState(.reconnecting(retry: retry + 1))
            }
            await scheduleReconnect(after: retry)
            return
        }

        guard !Task.isCancelled else {
            clearConnection()
            return
        }

        broadcast(event: .disconnected(nil))
        stateQueue.async { [weak self] in
            self?.setState(.reconnecting(retry: retry + 1))
        }
        await scheduleReconnect(after: retry)
    }

    private func scheduleReconnect(after retry: Int) async {
        let delay = UInt64(backoff(for: retry) * 1_000_000_000)
        await sleep(delay)
        guard !Task.isCancelled, shouldReconnect else {
            clearConnection()
            return
        }
        await runConnectionLoop(retry: retry + 1)
    }

    private func handleEvent(type: String, data: String) throws {
        guard !data.isEmpty, type != "keepalive" else { return }

        switch type {
        case "message.created":
            let payload = try decoder.decode(MessageCreatedEvent.self, from: Data(data.utf8))
            deliver(chatID: payload.chatID, event: .message(payload.message.asDomainMessage()))
        case "message.read":
            let payload = try decoder.decode(MessageReadEvent.self, from: Data(data.utf8))
            deliver(chatID: payload.chatID, event: .messageRead(messageID: payload.messageID))
        case "typing.changed":
            let payload = try decoder.decode(TypingEvent.self, from: Data(data.utf8))
            deliver(chatID: payload.chatID, event: .typing(participants: payload.typingParticipants))
        default:
            break
        }
    }

    private func deliver(chatID: UUID, event: ChatRealtimeEvent) {
        stateQueue.async { [weak self] in
            self?.globalEventContinuations.values.forEach { continuation in
                continuation.yield(ChatRealtimeEnvelope(chatID: chatID, event: event))
            }
            self?.eventContinuations[chatID]?.values.forEach { continuation in
                continuation.yield(event)
            }
        }
    }

    private func broadcast(event: ChatRealtimeEvent) {
        stateQueue.async { [weak self] in
            self?.eventContinuations.values.forEach { continuations in
                continuations.values.forEach { continuation in
                    continuation.yield(event)
                }
            }
        }
    }

    private func clearConnection() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            connectionTask = nil
            cancelHeartbeatMonitor()
            setState(.disconnected)
        }
    }

    private func stopConnection(manual: Bool, reconnectAllowed: Bool, broadcastDisconnection: Bool) {
        self.reconnectAllowed = reconnectAllowed
        shouldMaintainConnection = false
        connectionTask?.cancel()
        connectionTask = nil
        cancelHeartbeatMonitor()
        if broadcastDisconnection {
            broadcast(event: .disconnected(nil))
        }
        if manual {
            setState(.disconnected)
        }
    }

    private func disableRealtimeLoop() {
        isRealtimeTemporarilyDisabled = true
        stopConnection(manual: true, reconnectAllowed: false, broadcastDisconnection: false)
        setState(.failed(reason: "Realtime temporarily unavailable"))
    }

    private var shouldReconnect: Bool {
        stateQueue.sync {
            shouldMaintainConnection && reconnectAllowed && !isRealtimeTemporarilyDisabled
        }
    }

    private func restartHeartbeatMonitor() {
        cancelHeartbeatMonitor()
        guard heartbeatTimeout > 0 else { return }

        heartbeatMonitorTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await sleep(UInt64((heartbeatTimeout / 2) * 1_000_000_000))
                guard !Task.isCancelled else { return }

                let shouldFail = stateQueue.sync { [self] in
                    self.state == .connected && Date().timeIntervalSince(self.lastHeartbeatAt) > self.heartbeatTimeout
                }

                if shouldFail {
                    analytics.track(
                        error: AppError.network(description: "Realtime heartbeat timeout"),
                        context: "sse_heartbeat_timeout"
                    )
                    stateQueue.async { [weak self] in
                        guard let self else { return }
                        connectionTask?.cancel()
                        connectionTask = nil
                        setState(.reconnecting(retry: 1))
                    }
                    await scheduleReconnect(after: 0)
                    return
                }
            }
        }
    }

    private func cancelHeartbeatMonitor() {
        heartbeatMonitorTask?.cancel()
        heartbeatMonitorTask = nil
    }

    private func recordHeartbeat() {
        stateQueue.async { [weak self] in
            self?.lastHeartbeatAt = Date()
        }
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
}

struct RealtimeEventStream {
    let response: HTTPURLResponse
    let lines: AsyncThrowingStream<String, Error>
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
