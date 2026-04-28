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
    }

    @Published public private(set) var state: State
    private let tokenStore: TokenStore
    private let defaults: UserDefaults

    public init(tokenStore: TokenStore, defaults: UserDefaults = .standard) {
        self.tokenStore = tokenStore
        self.defaults = defaults

        if let token = tokenStore.retrieveToken(),
           let storedUserID = defaults.string(forKey: Constants.userIDKey),
           let userID = UUID(uuidString: storedUserID),
           let displayName = defaults.string(forKey: Constants.displayNameKey) {
            state = .authenticated(token: token, userID: userID, displayName: displayName)
            updateCurrentUser(userID: userID, displayName: displayName)
        } else {
            state = .unauthenticated
            resetCurrentUser()
        }
    }

    public func authenticate(with token: String, userID: UUID, displayName: String) {
        tokenStore.store(token: token)
        defaults.set(userID.uuidString, forKey: Constants.userIDKey)
        defaults.set(displayName, forKey: Constants.displayNameKey)
        updateCurrentUser(userID: userID, displayName: displayName)
        state = .authenticated(token: token, userID: userID, displayName: displayName)
    }

    public func logout() {
        tokenStore.clear()
        defaults.removeObject(forKey: Constants.userIDKey)
        defaults.removeObject(forKey: Constants.displayNameKey)
        resetCurrentUser()
        state = .unauthenticated
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
    func clear()
}
