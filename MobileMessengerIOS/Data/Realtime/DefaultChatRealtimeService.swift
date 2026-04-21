import Foundation

public final class DefaultChatRealtimeService: ChatRealtimeService, @unchecked Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: @Sendable () async -> String?
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let featureFlags: FeatureFlags
    private let decoder: JSONDecoder
    private var state: ChatRealtimeConnectionState = .disconnected
    private var shouldMaintainConnection = false
    private var isRealtimeTemporarilyDisabled = false
    private var subscribedChats: Set<UUID> = []
    private var eventContinuations: [UUID: [UUID: AsyncStream<ChatRealtimeEvent>.Continuation]] = [:]
    private var globalEventContinuations: [UUID: AsyncStream<ChatRealtimeEnvelope>.Continuation] = [:]
    private var stateContinuations: [UUID: AsyncStream<ChatRealtimeConnectionState>.Continuation] = [:]
    private let stateQueue = DispatchQueue(label: "realtime.state.queue")
    private var connectionTask: Task<Void, Never>?

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?,
        analytics: AnalyticsService,
        reachability: ReachabilityService,
        featureFlags: FeatureFlags
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authTokenProvider = authTokenProvider
        self.analytics = analytics
        self.reachability = reachability
        self.featureFlags = featureFlags

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
            shouldMaintainConnection = true
            guard connectionTask == nil else { return }
            updateState(.connecting(retry: 0))
            connectionTask = Task { [weak self] in
                await self?.runConnectionLoop(retry: 0)
            }
        }
    }

    public func deactivate() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            shouldMaintainConnection = false
            connectionTask?.cancel()
            connectionTask = nil
            updateState(.disconnected)
            broadcast(event: .disconnected(nil))
        }
    }

    public func connect(to chatID: UUID) {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            subscribedChats.insert(chatID)
        }
    }

    public func disconnect(from chatID: UUID) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            subscribedChats.remove(chatID)
            eventContinuations[chatID]?.values.forEach { $0.finish() }
            eventContinuations[chatID] = nil

            guard subscribedChats.isEmpty, !shouldMaintainConnection else { return }
            connectionTask?.cancel()
            connectionTask = nil
            updateState(.disconnected)
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

    private func runConnectionLoop(retry: Int) async {
        guard let token = await authTokenProvider() else {
            broadcast(event: .disconnected(AppError.unauthorized))
            clearConnection()
            return
        }

        if !reachability.isReachable {
            try? await Task.sleep(nanoseconds: UInt64(backoff(for: retry) * 1_000_000_000))
            await runConnectionLoop(retry: retry + 1)
            return
        }

        do {
            var request = URLRequest(url: baseURL.appendingPathComponent("realtime/events"))
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

            let (bytes, response) = try await session.bytes(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AppError.network(description: "Некорректный ответ realtime")
            }
            if [404, 405, 501].contains(httpResponse.statusCode) {
                analytics.track(error: AppError.network(description: "Realtime temporarily unavailable"), context: "sse_unsupported")
                disableRealtimeLoop()
                return
            }
            guard 200..<300 ~= httpResponse.statusCode else {
                throw AppError.network(description: "Не удалось подключиться к SSE")
            }

            updateState(.connected)
            broadcast(event: .connected)

            var currentType = "message"
            var currentData: [String] = []
            for try await line in bytes.lines {
                if Task.isCancelled { break }
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
            updateState(.reconnecting(retry: retry + 1))
            try? await Task.sleep(nanoseconds: UInt64(backoff(for: retry) * 1_000_000_000))
            guard !Task.isCancelled else {
                clearConnection()
                return
            }
            await runConnectionLoop(retry: retry + 1)
            return
        }

        guard !Task.isCancelled else {
            clearConnection()
            return
        }
        broadcast(event: .disconnected(nil))
        updateState(.reconnecting(retry: retry + 1))
        try? await Task.sleep(nanoseconds: UInt64(backoff(for: retry) * 1_000_000_000))
        guard shouldReconnect else {
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
            self?.connectionTask = nil
            self?.updateState(.disconnected)
        }
    }

    private func disableRealtimeLoop() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            isRealtimeTemporarilyDisabled = true
            shouldMaintainConnection = false
            connectionTask?.cancel()
            connectionTask = nil
            updateState(.connected)
        }
    }

    private var shouldReconnect: Bool {
        stateQueue.sync {
            shouldMaintainConnection && !isRealtimeTemporarilyDisabled
        }
    }

    private func updateState(_ newState: ChatRealtimeConnectionState) {
        stateQueue.async { [weak self] in
            self?.state = newState
            self?.stateContinuations.values.forEach { continuation in
                continuation.yield(newState)
            }
        }
    }

    private func backoff(for retry: Int) -> Double {
        min(pow(2.0, Double(retry)), 15)
    }
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
