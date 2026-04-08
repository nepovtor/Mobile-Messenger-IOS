import Foundation
import Combine

@MainActor
public final class SessionStore: ObservableObject {
    public struct AuthenticatedSession: Codable, Equatable, Sendable {
        public let token: String
        public let userID: UUID
        public let displayName: String

        public init(token: String, userID: UUID, displayName: String) {
            self.token = token
            self.userID = userID
            self.displayName = displayName
        }
    }

    public enum State: Equatable {
        case unauthenticated
        case authenticated(AuthenticatedSession)
    }

    @Published public private(set) var state: State
    private let tokenStore: TokenStore

    public init(tokenStore: TokenStore) {
        self.tokenStore = tokenStore
        if let session = tokenStore.retrieveSession() {
            state = .authenticated(session)
        } else {
            state = .unauthenticated
        }
    }

    public func authenticate(token: String, userID: UUID, displayName: String) {
        let session = AuthenticatedSession(token: token, userID: userID, displayName: displayName)
        tokenStore.store(session: session)
        state = .authenticated(session)
    }

    public func updateDisplayName(_ displayName: String) {
        guard case .authenticated(let session) = state else { return }
        let updatedSession = AuthenticatedSession(
            token: session.token,
            userID: session.userID,
            displayName: displayName
        )
        tokenStore.store(session: updatedSession)
        state = .authenticated(updatedSession)
    }

    public func logout() {
        tokenStore.clear()
        state = .unauthenticated
    }

    public var authToken: String? {
        currentSession?.token
    }

    public var currentSession: AuthenticatedSession? {
        if case .authenticated(let session) = state {
            return session
        }
        return nil
    }

    public var currentUserID: UUID? {
        currentSession?.userID
    }

    public var currentUserDisplayName: String? {
        currentSession?.displayName
    }

    public var isAuthenticated: Bool {
        currentSession != nil
    }
}

public protocol TokenStore: Sendable {
    func store(session: SessionStore.AuthenticatedSession)
    func retrieveSession() -> SessionStore.AuthenticatedSession?
    func clear()
}
