import Foundation
import SwiftUI

@MainActor
public final class ConnectionCoordinator: ObservableObject {
    public enum Status: Equatable {
        case offline
        case connecting
        case reconnecting
        case online

        public var title: String {
            switch self {
            case .offline: "Оффлайн"
            case .connecting: "Подключение"
            case .reconnecting: "Переподключаемся"
            case .online: "Онлайн"
            }
        }

        public var subtitle: String {
            switch self {
            case .offline: "Показываем сохраненные данные"
            case .connecting: "Поднимаем соединение"
            case .reconnecting: "Восстанавливаем realtime и синхронизацию"
            case .online: "Синхронизация работает"
            }
        }

        public var systemImage: String {
            switch self {
            case .offline: "wifi.slash"
            case .connecting: "antenna.radiowaves.left.and.right"
            case .reconnecting: "arrow.triangle.2.circlepath"
            case .online: "checkmark.circle.fill"
            }
        }
    }

    private let sessionStore: SessionStore
    private let reachability: ReachabilityService
    private var realtimeService: ChatRealtimeService?
    private var foregroundRefresh: (@MainActor () async -> Void)?
    private var connectionStateTask: Task<Void, Never>?
    private var latestRealtimeState: ChatRealtimeConnectionState = .disconnected
    public private(set) var isSceneActive = false

    @Published public private(set) var status: Status = .offline
    @Published public private(set) var realtimeState: ChatRealtimeConnectionState = .disconnected

    public init(sessionStore: SessionStore, reachability: ReachabilityService) {
        self.sessionStore = sessionStore
        self.reachability = reachability
    }

    public func configure(
        realtimeService: ChatRealtimeService,
        foregroundRefresh: @escaping @MainActor () async -> Void
    ) {
        self.realtimeService?.deactivate()
        self.realtimeService = realtimeService
        self.foregroundRefresh = foregroundRefresh
        bindConnectionState()
    }

    public func handleScenePhase(_ scenePhase: ScenePhase) {
        switch scenePhase {
        case .active:
            isSceneActive = true
            Task { await refresh() }
        case .inactive, .background:
            isSceneActive = false
            realtimeService?.deactivate()
            updateStatus()
        @unknown default:
            break
        }
    }

    public func refresh() async {
        guard sessionStore.authToken != nil else {
            realtimeService?.deactivate()
            status = .offline
            return
        }
        await foregroundRefresh?()
        updateStatus()
    }

    public func sessionEnded() {
        realtimeService?.handleLogout()
        latestRealtimeState = .disconnected
        realtimeState = .disconnected
        status = .offline
    }

    private func bindConnectionState() {
        connectionStateTask?.cancel()
        guard let realtimeService else { return }
        connectionStateTask = Task { [weak self] in
            for await state in realtimeService.observeConnectionState() {
                guard let self else { return }
                latestRealtimeState = state
                realtimeState = state
                updateStatus()
            }
        }
        updateStatus()
    }

    private func updateStatus() {
        guard sessionStore.authToken != nil else {
            status = .offline
            return
        }
        guard isSceneActive else {
            status = reachability.isReachable ? .reconnecting : .offline
            return
        }
        guard reachability.isReachable else {
            status = .offline
            return
        }
        switch latestRealtimeState {
        case .connected: status = .online
        case .connecting: status = .connecting
        case .reconnecting, .disconnected: status = .reconnecting
        case .failed: status = .offline
        }
    }
}
