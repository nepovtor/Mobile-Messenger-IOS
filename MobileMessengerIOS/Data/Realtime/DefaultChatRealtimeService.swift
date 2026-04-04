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
    private var state: State = .disconnected
    private var eventContinuations: [UUID: AsyncStream<ChatRealtimeEvent>.Continuation] = [:]
    private let stateQueue = DispatchQueue(label: "realtime.state.queue")

    public init(baseURL: URL, analytics: AnalyticsService, reachability: ReachabilityService, featureFlags: FeatureFlags) {
        self.baseURL = baseURL
        self.analytics = analytics
        self.reachability = reachability
        self.featureFlags = featureFlags
    }

    public func connect(to chatID: UUID) {
        guard featureFlags.isRealtimeEnabled else { return }
        stateQueue.async { [weak self] in
            guard let self else { return }
            switch state {
            case .connected:
                break
            default:
                state = .connecting(retry: 0)
                scheduleConnection(for: chatID, retry: 0)
            }
        }
    }

    public func disconnect(from chatID: UUID) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            state = .disconnected
            eventContinuations[chatID]?.yield(.disconnected(nil))
            eventContinuations[chatID]?.finish()
            eventContinuations[chatID] = nil
        }
    }

    public func sendMessage(chatID: UUID, text: String, localID: UUID) async throws {
        guard featureFlags.isRealtimeEnabled else { return }
        try await Task.sleep(nanoseconds: 150_000_000) // simulate network
        let message = Message(
            id: Message.Identifier(chatID: chatID, messageID: UUID()),
            localID: localID,
            authorID: SessionStore.Constants.currentUserID,
            authorName: SessionStore.Constants.currentUserDisplayName,
            text: text,
            createdAt: Date(),
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

    private func scheduleConnection(for chatID: UUID, retry: Int) {
        Task.detached { [weak self] in
            guard let self else { return }
            if !reachability.isReachable {
                try? await Task.sleep(nanoseconds: UInt64(backoff(for: retry) * 1_000_000_000))
                scheduleReconnection(for: chatID, retry: retry + 1)
                return
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            stateQueue.async { [weak self] in
                guard let self else { return }
                state = .connected
                eventContinuations[chatID]?.yield(.connected)
                spawnFakeStream(for: chatID)
            }
        }
    }

    private func scheduleReconnection(for chatID: UUID, retry: Int) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            state = .reconnecting(retry: retry)
            scheduleConnection(for: chatID, retry: retry)
        }
    }

    private func spawnFakeStream(for chatID: UUID) {
        Task.detached { [weak self] in
            guard let self else { return }
            for await reachable in reachability.observe() {
                if reachable {
                    stateQueue.async { [weak self] in
                        guard let self else { return }
                        if case .reconnecting = state {
                            state = .connected
                            eventContinuations[chatID]?.yield(.connected)
                        }
                    }
                } else {
                    stateQueue.async { [weak self] in
                        guard let self else { return }
                        state = .reconnecting(retry: 0)
                        eventContinuations[chatID]?.yield(.disconnected(nil))
                    }
                }
            }
        }
    }

    private func backoff(for retry: Int) -> Double {
        min(pow(2.0, Double(retry)), 30)
    }
}

