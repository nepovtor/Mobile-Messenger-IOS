import Combine
import Foundation

@MainActor
public final class AppSessionCoordinator {
    private let sessionStore: SessionStore
    private let router: AppRouter
    private let connectionCoordinator: ConnectionCoordinator
    private var stateCancellable: AnyCancellable?
    private var lastAuthenticatedUserID: UUID?
    private var realtimeService: ChatRealtimeService?
    private var resetLocalState: (@MainActor () async -> Void)?
    private var syncNotifications: (@MainActor () async -> Void)?
    private var sessionEnded: (@MainActor () -> Void)?
    private var detachNotifications: (@MainActor () async -> Void)?

    public init(
        sessionStore: SessionStore,
        router: AppRouter,
        connectionCoordinator: ConnectionCoordinator
    ) {
        self.sessionStore = sessionStore
        self.router = router
        self.connectionCoordinator = connectionCoordinator
        bindSessionState()
    }

    public func configure(
        realtimeService: ChatRealtimeService,
        resetLocalState: @escaping @MainActor () async -> Void,
        syncNotifications: @escaping @MainActor () async -> Void,
        sessionEnded: @escaping @MainActor () -> Void,
        detachNotifications: @escaping @MainActor () async -> Void
    ) {
        self.realtimeService = realtimeService
        self.resetLocalState = resetLocalState
        self.syncNotifications = syncNotifications
        self.sessionEnded = sessionEnded
        self.detachNotifications = detachNotifications
    }

    public func logout() async {
        await detachNotifications?()
        sessionStore.logout()
    }

    public func handleUnauthorized() {
        sessionEnded?()
        sessionStore.logout()
    }

    private func bindSessionState() {
        stateCancellable = sessionStore.$state.sink { [weak self] state in
            guard let self else { return }
            switch state {
            case .authenticated(_, let userID, _):
                let previousUserID = lastAuthenticatedUserID
                lastAuthenticatedUserID = userID
                Task {
                    if previousUserID != nil, previousUserID != userID {
                        self.realtimeService?.handleLogout()
                        await self.resetLocalState?()
                    }
                    await self.syncNotifications?()
                    if self.connectionCoordinator.isSceneActive {
                        await self.connectionCoordinator.refresh()
                    }
                }
            case .unauthenticated:
                lastAuthenticatedUserID = nil
                connectionCoordinator.sessionEnded()
                sessionEnded?()
                router.resetForLoggedOutSession()
                Task { await self.resetLocalState?() }
            }
        }
    }
}
