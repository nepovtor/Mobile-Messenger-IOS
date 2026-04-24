import Foundation
import Combine

@MainActor
public final class SessionStore: ObservableObject {
    public enum State: Equatable {
        case unauthenticated
        case authenticated(token: String, userID: UUID, displayName: String, phone: String)
    }

    public enum Constants {
        public static let defaultUserID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        public static let defaultUserDisplayName = "Вы"
        public static var currentUserID = defaultUserID
        public static var currentUserDisplayName = defaultUserDisplayName
        static let userIDKey = "auth.user_id"
        static let displayNameKey = "auth.display_name"
        static let phoneKey = "auth.phone"
    }

    @Published public private(set) var state: State
    private let tokenStore: TokenStore
    private let defaults: UserDefaults

    public init(tokenStore: TokenStore, defaults: UserDefaults = .standard) {
        self.tokenStore = tokenStore
        self.defaults = defaults

        if let token = tokenStore.getAccessToken(),
           let storedUserID = defaults.string(forKey: Constants.userIDKey),
           let userID = UUID(uuidString: storedUserID),
           let displayName = defaults.string(forKey: Constants.displayNameKey),
           let phone = defaults.string(forKey: Constants.phoneKey) {
            state = .authenticated(token: token, userID: userID, displayName: displayName, phone: phone)
            updateCurrentUser(userID: userID, displayName: displayName)
        } else {
            state = .unauthenticated
            resetCurrentUser()
        }
    }

    public func authenticate(with token: String, userID: UUID, displayName: String, phone: String) {
        tokenStore.saveAccessToken(token)
        defaults.set(userID.uuidString, forKey: Constants.userIDKey)
        defaults.set(displayName, forKey: Constants.displayNameKey)
        defaults.set(phone, forKey: Constants.phoneKey)
        updateCurrentUser(userID: userID, displayName: displayName)
        state = .authenticated(token: token, userID: userID, displayName: displayName, phone: phone)
    }

    public func authenticate(with session: AuthenticatedSession) {
        authenticate(
            with: session.accessToken,
            userID: session.userID,
            displayName: session.displayName,
            phone: session.phone
        )
    }

    public func logout() {
        tokenStore.clearAccessToken()
        defaults.removeObject(forKey: Constants.userIDKey)
        defaults.removeObject(forKey: Constants.displayNameKey)
        defaults.removeObject(forKey: Constants.phoneKey)
        resetCurrentUser()
        state = .unauthenticated
    }

    public var authToken: String? {
        if case .authenticated(let token, _, _, _) = state { return token }
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
    func saveAccessToken(_ token: String)
    func getAccessToken() -> String?
    func clearAccessToken()
}

public struct AuthenticatedSession: Equatable, Sendable {
    public let accessToken: String
    public let userID: UUID
    public let displayName: String
    public let phone: String

    public init(accessToken: String, userID: UUID, displayName: String, phone: String) {
        self.accessToken = accessToken
        self.userID = userID
        self.displayName = displayName
        self.phone = phone
    }
}
