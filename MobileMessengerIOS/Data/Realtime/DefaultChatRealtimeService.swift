import Foundation

public final class DefaultChatRealtimeService: ChatRealtimeService, @unchecked Sendable {
    public enum State: Equatable {
        case disconnected
        case connecting(retry: Int)
        case connected
        case reconnecting(retry: Int)
    }

    private let baseURL: URL
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let featureFlags: FeatureFlags
    private let userSessionProvider: @Sendable () -> SessionStore.AuthenticatedSession?
    private let session: URLSession
    private var stateByChatID: [UUID: State] = [:]
    private var eventContinuations: [UUID: AsyncStream<ChatRealtimeEvent>.Continuation] = [:]
    private var streamTasks: [UUID: Task<Void, Never>] = [:]
    private let stateQueue = DispatchQueue(label: "realtime.state.queue")

    public init(
        baseURL: URL,
        analytics: AnalyticsService,
        reachability: ReachabilityService,
        featureFlags: FeatureFlags,
        session: URLSession = .shared,
        userSessionProvider: @escaping @Sendable () -> SessionStore.AuthenticatedSession?
    ) {
        self.baseURL = baseURL
        self.analytics = analytics
        self.reachability = reachability
        self.featureFlags = featureFlags
        self.session = session
        self.userSessionProvider = userSessionProvider
    }

    public func connect(to chatID: UUID) {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            if streamTasks[chatID] != nil {
                return
            }

            stateByChatID[chatID] = .connecting(retry: 0)
            streamTasks[chatID] = Task.detached { [weak self] in
                await self?.runEventStream(for: chatID)
            }
        }
    }

    public func disconnect(from chatID: UUID) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            streamTasks[chatID]?.cancel()
            streamTasks[chatID] = nil
            stateByChatID[chatID] = .disconnected
            eventContinuations[chatID]?.yield(.disconnected(nil))
            eventContinuations[chatID]?.finish()
            eventContinuations[chatID] = nil
        }
    }

    public func sendMessage(chatID: UUID, text: String, localID: UUID) async throws {
        guard featureFlags.isRealtimeEnabled else { return }
        guard let currentSession = userSessionProvider() else {
            throw AppError.unauthorized
        }

        try await Task.sleep(nanoseconds: 150_000_000)
        let message = Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: localID,
            authorID: currentSession.userID,
            authorName: currentSession.displayName,
            text: text,
            createdAt: Date(),
            isOutgoing: true,
            status: .sent
        )
        eventContinuations[chatID]?.yield(.message(message))
    }

    public func observeEvents(for chatID: UUID) -> AsyncStream<ChatRealtimeEvent> {
        AsyncStream { continuation in
            eventContinuations[chatID] = continuation
            continuation.onTermination = { [weak self] _ in
                self?.eventContinuations[chatID] = nil
            }
        }
    }

    private func runEventStream(for chatID: UUID) async {
        var retry = 0

        while !Task.isCancelled {
            if !reachability.isReachable {
                updateState(.reconnecting(retry: retry), for: chatID)
                yield(.disconnected(nil), for: chatID)
                try? await Task.sleep(nanoseconds: UInt64(backoff(for: retry) * 1_000_000_000))
                retry += 1
                continue
            }

            guard let currentSession = userSessionProvider() else {
                yield(.disconnected(AppError.unauthorized), for: chatID)
                break
            }

            do {
                updateState(retry == 0 ? .connecting(retry: retry) : .reconnecting(retry: retry), for: chatID)
                let request = makeSSERequest(chatID: chatID, token: currentSession.token)
                let (bytes, response) = try await session.bytes(for: request)
                guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
                    throw AppError.network(description: AppLanguagePreference.localized(ru: "Не удалось подключить realtime-канал", en: "Failed to connect realtime stream"))
                }

                updateState(.connected, for: chatID)
                yield(.connected, for: chatID)
                retry = 0

                try await consumeEventStream(bytes: bytes, chatID: chatID, currentUserID: currentSession.userID)
            } catch {
                guard !Task.isCancelled else { break }
                analytics.track(error: error, context: "chat_realtime_stream")
                updateState(.reconnecting(retry: retry), for: chatID)
                yield(.disconnected(error), for: chatID)
                try? await Task.sleep(nanoseconds: UInt64(backoff(for: retry) * 1_000_000_000))
                retry += 1
            }
        }

        stateQueue.async { [weak self] in
            guard let self else { return }
            streamTasks[chatID] = nil
            stateByChatID[chatID] = .disconnected
        }
    }

    private func consumeEventStream(
        bytes: URLSession.AsyncBytes,
        chatID: UUID,
        currentUserID: String
    ) async throws {
        var eventName = "message"
        var dataLines: [String] = []

        for try await line in bytes.lines {
            guard !Task.isCancelled else { return }

            if line.isEmpty {
                try dispatchEvent(named: eventName, dataLines: dataLines, chatID: chatID, currentUserID: currentUserID)
                eventName = "message"
                dataLines.removeAll(keepingCapacity: true)
                continue
            }

            if line.hasPrefix(":") {
                continue
            }

            if line.hasPrefix("event:") {
                eventName = line.replacingOccurrences(of: "event:", with: "").trimmingCharacters(in: .whitespaces)
                continue
            }

            if line.hasPrefix("data:") {
                let data = line.replacingOccurrences(of: "data:", with: "").trimmingCharacters(in: .whitespaces)
                dataLines.append(data)
                continue
            }
        }
    }

    private func dispatchEvent(
        named eventName: String,
        dataLines: [String],
        chatID: UUID,
        currentUserID: String
    ) throws {
        guard !dataLines.isEmpty else { return }

        let rawData = dataLines.joined(separator: "\n")
        guard let data = rawData.data(using: .utf8) else { return }
        let decoder = Self.makeJSONDecoder()

        switch eventName {
        case "connected", "chatUpdated":
            let chatDTO = try decoder.decode(ChatDTO.self, from: data)
            let chat = Chat(
                id: chatDTO.id,
                title: chatDTO.title,
                lastMessagePreview: chatDTO.lastMessagePreview,
                lastActivity: chatDTO.lastActivity,
                unreadCount: chatDTO.unreadCount,
                typingParticipants: chatDTO.typingParticipants
            )
            yield(.chatUpdated(chat), for: chatID)
        case "message":
            let dto = try decoder.decode(MessageDTO.self, from: data)
            let message = Message(
                id: Message.Identifier(chatID: chatID, messageID: dto.messageID),
                localID: dto.messageID,
                authorID: dto.authorID,
                authorName: dto.authorName,
                text: dto.text,
                createdAt: dto.createdAt,
                isOutgoing: dto.authorID == currentUserID,
                status: MessageStatus(rawValue: dto.status) ?? .delivered
            )
            yield(.message(message), for: chatID)
        default:
            break
        }
    }

    private func makeSSERequest(chatID: UUID, token: String) -> URLRequest {
        let url = baseURL
            .appendingPathComponent("chats")
            .appendingPathComponent(chatID.uuidString.lowercased())
            .appendingPathComponent("events")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.timeoutInterval = 120
        return request
    }

    private func updateState(_ state: State, for chatID: UUID) {
        stateQueue.async { [weak self] in
            self?.stateByChatID[chatID] = state
        }
    }

    private func yield(_ event: ChatRealtimeEvent, for chatID: UUID) {
        stateQueue.async { [weak self] in
            self?.eventContinuations[chatID]?.yield(event)
        }
    }

    private static func makeJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    public func currentState(for chatID: UUID) -> State {
        stateQueue.sync {
            stateByChatID[chatID] ?? .disconnected
        }
    }

    public func debugDescription(for chatID: UUID) -> String {
        let state = currentState(for: chatID)
        switch state {
        case .disconnected:
            return "disconnected"
        case .connecting(let retry):
            return "connecting(\(retry))"
        case .connected:
            return "connected"
        case .reconnecting(let retry):
            return "reconnecting(\(retry))"
        }
    }

    private func backoff(for retry: Int) -> Double {
        min(pow(2.0, Double(retry)), 15)
    }
}
