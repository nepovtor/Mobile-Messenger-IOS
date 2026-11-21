import Combine
import Foundation

@MainActor
public final class AppSessionCoordinator {
    private let sessionStore: SessionStore
    private let router: AppRouter
    private let connectionCoordinator: ConnectionCoordinator
    private var stateCancellable: AnyCancellable?
    private var authenticationTask: Task<Void, Never>?
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
        syncNotifications: @escaping @MainActor () async -> Void,
        sessionEnded: @escaping @MainActor () -> Void,
        detachNotifications: @escaping @MainActor () async -> Void
    ) {
        self.syncNotifications = syncNotifications
        self.sessionEnded = sessionEnded
        self.detachNotifications = detachNotifications
    }

    public func logout(
        beforeClearing: @MainActor () async throws -> Void = {}
    ) async throws {
        sessionStore.beginLogout()
        authenticationTask?.cancel()
        connectionCoordinator.sessionEnded()
        sessionEnded?()
        await detachNotifications?()
        try await beforeClearing()
        sessionStore.logout()
    }

    public func handleUnauthorized() {
        guard !sessionStore.isLogoutPending else { return }
        sessionEnded?()
        sessionStore.logout()
    }

    private func bindSessionState() {
        stateCancellable = sessionStore.$state.sink { [weak self] state in
            guard let self else { return }
            switch state {
            case .authenticated(_, let userID, _):
                guard !sessionStore.isLogoutPending else { return }
                authenticationTask?.cancel()
                let namespace = sessionStore.cacheNamespace
                authenticationTask = Task { [weak self] in
                    guard let self, !Task.isCancelled,
                          self.sessionStore.cacheNamespace == namespace,
                          self.sessionStore.currentUserID == userID else { return }
                    await self.syncNotifications?()
                    guard !Task.isCancelled,
                          self.sessionStore.cacheNamespace == namespace,
                          self.sessionStore.currentUserID == userID else { return }
                    if self.connectionCoordinator.isSceneActive {
                        await self.connectionCoordinator.refresh()
                    }
                }
            case .unauthenticated:
                authenticationTask?.cancel()
                authenticationTask = nil
                connectionCoordinator.sessionEnded()
                sessionEnded?()
                router.resetForLoggedOutSession()
            }
        }
    }
}
