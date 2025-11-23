import Foundation
import Combine

@MainActor
public final class SessionStore: ObservableObject {
    public enum State: Equatable {
        case unauthenticated
        case authenticated(token: String, userID: UUID, displayName: String)
    }

    public enum Constants {
        public static let currentUserID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        public static let currentUserDisplayName = "Вы"
        static let tokenKey = "auth.token"
    }

    @Published public private(set) var state: State
    private let tokenStore: TokenStore

    public init(tokenStore: TokenStore) {
        if let token = tokenStore.retrieveToken() {
            state = .authenticated(token: token, userID: Constants.currentUserID, displayName: Constants.currentUserDisplayName)
        } else {
            state = .unauthenticated
        }
        self.tokenStore = tokenStore
    }

    public func authenticate(with token: String) {
        tokenStore.store(token: token)
        state = .authenticated(token: token, userID: Constants.currentUserID, displayName: Constants.currentUserDisplayName)
    }

    public func logout() {
        tokenStore.clear()
        state = .unauthenticated
    }

    public var authToken: String? {
        if case .authenticated(let token, _, _) = state { return token }
        return nil
    }
}

public protocol TokenStore {
    func store(token: String)
    func retrieveToken() -> String?
    func clear()
}
