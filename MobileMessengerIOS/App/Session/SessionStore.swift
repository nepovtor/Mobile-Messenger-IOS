import Foundation
import Combine

@MainActor
public final class SessionStore: ObservableObject {
    public enum State: Equatable {
        case unauthenticated
        case authenticated(token: String, userID: UUID, displayName: String)
    }

    public enum Constants {
        public static let defaultUserID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        public static let defaultUserDisplayName = "Вы"
        public static var currentUserID = defaultUserID
        public static var currentUserDisplayName = defaultUserDisplayName
        static let tokenKey = "auth.token"
        static let userIDKey = "auth.user_id"
        static let displayNameKey = "auth.display_name"
        static let logoutPendingKey = "auth.logout_pending"
        static let cacheNamespaceKey = "auth.cache_namespace"
    }

    @Published public private(set) var isLogoutPending: Bool
    @Published public private(set) var state: State
    public private(set) var cacheNamespace: UUID
    public var sessionBoundaryHandler: (() -> Void)?
    private let tokenStore: TokenStore
    private let defaults: UserDefaults

    public init(tokenStore: TokenStore, defaults: UserDefaults = .standard) {
        self.tokenStore = tokenStore
        self.defaults = defaults
        isLogoutPending = defaults.bool(forKey: Constants.logoutPendingKey)
        cacheNamespace = defaults.string(forKey: Constants.cacheNamespaceKey)
            .flatMap(UUID.init(uuidString:)) ?? UUID()

        if let token = tokenStore.retrieveToken(),
           let storedUserID = defaults.string(forKey: Constants.userIDKey),
           let userID = UUID(uuidString: storedUserID),
           let displayName = defaults.string(forKey: Constants.displayNameKey) {
            state = .authenticated(token: token, userID: userID, displayName: displayName)
            defaults.set(cacheNamespace.uuidString, forKey: Constants.cacheNamespaceKey)
            updateCurrentUser(userID: userID, displayName: displayName)
        } else {
            state = .unauthenticated
            resetCurrentUser()
        }
    }

    public func authenticate(
        with token: String,
        refreshToken: String? = nil,
        userID: UUID,
        displayName: String
    ) {
        guard !isLogoutPending else { return }
        cacheNamespace = UUID()
        defaults.set(cacheNamespace.uuidString, forKey: Constants.cacheNamespaceKey)
        tokenStore.clear()
        tokenStore.store(token: token)
        if let refreshToken {
            tokenStore.store(refreshToken: refreshToken)
        }
        defaults.set(userID.uuidString, forKey: Constants.userIDKey)
        defaults.set(displayName, forKey: Constants.displayNameKey)
        updateCurrentUser(userID: userID, displayName: displayName)
        state = .authenticated(token: token, userID: userID, displayName: displayName)
        sessionBoundaryHandler?()
    }

    /// Retain the Keychain refresh credential until the server acknowledges
    /// revocation. Invalidate all messaging work immediately, including on retry.
    public func beginLogout() {
        guard !isLogoutPending else { return }
        defaults.set(true, forKey: Constants.logoutPendingKey)
        isLogoutPending = true
        cacheNamespace = UUID()
        defaults.set(cacheNamespace.uuidString, forKey: Constants.cacheNamespaceKey)
        sessionBoundaryHandler?()
    }

    public func logout() {
        defaults.removeObject(forKey: Constants.logoutPendingKey)
        isLogoutPending = false
        cacheNamespace = UUID()
        defaults.removeObject(forKey: Constants.cacheNamespaceKey)
        tokenStore.clear()
        defaults.removeObject(forKey: Constants.userIDKey)
        defaults.removeObject(forKey: Constants.displayNameKey)
        resetCurrentUser()
        state = .unauthenticated
        sessionBoundaryHandler?()
    }

    public func updateDisplayName(_ displayName: String) {
        guard case let .authenticated(token, userID, _) = state else {
            return
        }

        defaults.set(displayName, forKey: Constants.displayNameKey)
        updateCurrentUser(userID: userID, displayName: displayName)
        state = .authenticated(token: token, userID: userID, displayName: displayName)
    }

    public var currentUserID: UUID? {
        if case .authenticated(_, let userID, _) = state { return userID }
        return nil
    }

    public var currentDisplayName: String? {
        if case .authenticated(_, _, let displayName) = state { return displayName }
        return nil
    }

    public var authToken: String? {
        if case .authenticated(let token, _, _) = state { return token }
        return nil
    }

    public var authRefreshToken: String? {
        tokenStore.retrieveRefreshToken()
    }

    public func updateCredentials(accessToken: String, refreshToken: String?) {
        guard !isLogoutPending else { return }
        guard case let .authenticated(_, userID, displayName) = state else {
            return
        }
        tokenStore.store(token: accessToken)
        if let refreshToken {
            tokenStore.store(refreshToken: refreshToken)
        }
        state = .authenticated(
            token: accessToken,
            userID: userID,
            displayName: displayName
        )
    }

    private func updateCurrentUser(userID: UUID, displayName: String) {
        Constants.currentUserID = userID
        Constants.currentUserDisplayName = displayName
    }

    private func resetCurrentUser() {
        Constants.currentUserID = Constants.defaultUserID
        Constants.currentUserDisplayName = Constants.defaultUserDisplayName
    }
}

public protocol TokenStore {
    func store(token: String)
    func retrieveToken() -> String?
    func store(refreshToken: String)
    func retrieveRefreshToken() -> String?
    func clear()
}

public extension TokenStore {
    func store(refreshToken: String) {}
    func retrieveRefreshToken() -> String? { nil }
}
