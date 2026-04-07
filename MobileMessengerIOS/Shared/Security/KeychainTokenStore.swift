import Foundation
import Security

public final class KeychainTokenStore: TokenStore {
    private let service = "com.mobilemessenger.auth"
    private let account = "auth_token"

    public init() {}

    public func store(session: SessionStore.AuthenticatedSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        let attributes: [String: Any] = query.merging([kSecValueData as String: data]) { $1 }
        SecItemAdd(attributes as CFDictionary, nil)
    }

    public func retrieveSession() -> SessionStore.AuthenticatedSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let session = try? JSONDecoder().decode(SessionStore.AuthenticatedSession.self, from: data) else {
            return nil
        }
        return session
    }

    public func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
