import Foundation
import Security

public final class KeychainDeviceIdentifierStore: @unchecked Sendable {
    public static let shared = KeychainDeviceIdentifierStore()

    private let service = "com.mobilemessenger.device"
    private let account = "installation_id"

    private init() {}

    public func retrieveOrCreateIdentifier() -> String {
        if let existingIdentifier = retrieveIdentifier() {
            return existingIdentifier
        }

        let generatedIdentifier = UUID().uuidString
        guard let data = generatedIdentifier.data(using: .utf8) else {
            return generatedIdentifier
        }

        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemAdd(attributes as CFDictionary, nil)

        if status == errSecSuccess {
            return generatedIdentifier
        }

        return retrieveIdentifier() ?? generatedIdentifier
    }

    private func retrieveIdentifier() -> String? {
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
              let identifier = String(data: data, encoding: .utf8),
              UUID(uuidString: identifier) != nil else {
            return nil
        }

        return identifier
    }
}

public final class KeychainTokenStore: TokenStore {
    private let service = "com.mobilemessenger.auth"
    private let account = "auth_token"
    private let refreshAccount = "refresh_token"

    public init() {}

    public func store(token: String) {
        guard let data = token.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        let attributes: [String: Any] = query.merging([
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]) { $1 }
        SecItemAdd(attributes as CFDictionary, nil)
    }

    public func retrieveToken() -> String? {
        retrieve(account: account)
    }

    public func store(refreshToken: String) {
        store(value: refreshToken, account: refreshAccount)
    }

    public func retrieveRefreshToken() -> String? {
        retrieve(account: refreshAccount)
    }

    private func store(value: String, account: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        let attributes: [String: Any] = query.merging([
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]) { $1 }
        SecItemAdd(attributes as CFDictionary, nil)
    }

    private func retrieve(account: String) -> String? {
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
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        return token
    }

    public func clear() {
        for storedAccount in [account, refreshAccount] {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: storedAccount
            ]
            SecItemDelete(query as CFDictionary)
        }
    }
}

#if DEBUG
public final class InMemoryTokenStore: TokenStore {
    private var token: String?
    private var refreshToken: String?

    public init(token: String? = nil, refreshToken: String? = nil) {
        self.token = token
        self.refreshToken = refreshToken
    }

    public func store(token: String) {
        self.token = token
    }

    public func retrieveToken() -> String? {
        token
    }

    public func store(refreshToken: String) {
        self.refreshToken = refreshToken
    }

    public func retrieveRefreshToken() -> String? {
        refreshToken
    }

    public func clear() {
        token = nil
        refreshToken = nil
    }
}
#endif
