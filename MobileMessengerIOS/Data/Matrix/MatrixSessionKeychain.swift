import CryptoKit
import Foundation
import MatrixRustSDK
import Security

/// One current device per application account. SDK refresh callbacks are fenced
/// synchronously so an old client cannot replace a newly opened device's tokens.
final class MatrixSessionKeychain: ClientSessionDelegate, @unchecked Sendable {
    private struct Record: Codable {
        let accessToken: String
        let refreshToken: String?
        let userID: String
        let deviceID: String
        let homeserverURL: String
        let oauthData: String?
        let nativeSync: Bool

        init(_ session: Session) {
            accessToken = session.accessToken
            refreshToken = session.refreshToken
            userID = session.userId
            deviceID = session.deviceId
            homeserverURL = session.homeserverUrl
            oauthData = session.oauthData
            nativeSync = session.slidingSyncVersion == .native
        }
        var session: Session {
            Session(accessToken: accessToken, refreshToken: refreshToken, userId: userID,
                    deviceId: deviceID, homeserverUrl: homeserverURL, oauthData: oauthData,
                    slidingSyncVersion: nativeSync ? .native : .none)
        }
    }

    private let mutex = NSLock()
    private var active = true
    private let config: NativeMatrixConfig
    private let onFailure: @Sendable () -> Void
    private let query: [String: Any]
    let deviceID: String
    let restoredSession: Session?

    init(config: NativeMatrixConfig, onFailure: @escaping @Sendable () -> Void) throws {
        self.config = config
        self.onFailure = onFailure
        let identity = Data("\(config.homeserverURL.absoluteString)\u{0}\(config.expectedUserID)".utf8)
        let account = SHA256.hash(data: identity).map { String(format: "%02x", $0) }.joined()
        let lookupQuery: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                 kSecAttrService as String: "com.mobilemessenger.matrix.session.v1",
                 kSecAttrAccount as String: account]
        query = lookupQuery
        var result: AnyObject?
        let status = SecItemCopyMatching(lookupQuery.merging([
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne
        ]) { $1 } as CFDictionary, &result)
        if status == errSecItemNotFound {
            restoredSession = nil
            deviceID = UUID().uuidString
        } else {
            guard status == errSecSuccess, let data = result as? Data else {
                throw MatrixWorkspaceError.keychain(status)
            }
            let record = try JSONDecoder().decode(Record.self, from: data)
            guard record.userID == config.expectedUserID,
                  URL(string: record.homeserverURL)?.host == config.homeserverURL.host,
                  URL(string: record.homeserverURL)?.scheme == "https",
                  URL(string: record.homeserverURL)?.port == config.homeserverURL.port,
                  ["", "/"].contains(URL(string: record.homeserverURL)?.path ?? "invalid"),
                  URL(string: record.homeserverURL)?.user == nil, URL(string: record.homeserverURL)?.password == nil,
                  URL(string: record.homeserverURL)?.query == nil, URL(string: record.homeserverURL)?.fragment == nil,
                  !record.deviceID.isEmpty else {
                throw MatrixWorkspaceError.invalidConfiguration
            }
            restoredSession = record.session
            deviceID = record.deviceID
        }
    }

    func retrieveSessionFromKeychain(userId: String) throws -> Session {
        mutex.lock(); defer { mutex.unlock() }
        guard active, userId == config.expectedUserID else { throw MatrixWorkspaceError.sessionClosed }
        var result: AnyObject?
        let status = SecItemCopyMatching(query.merging([
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne
        ]) { $1 } as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { throw MatrixWorkspaceError.keychain(status) }
        let session = try JSONDecoder().decode(Record.self, from: data).session
        try validate(session)
        return session
    }

    func saveSessionInKeychain(session: Session) {
        do { try save(session) } catch { onFailure() }
    }

    func save(_ session: Session) throws {
        mutex.lock(); defer { mutex.unlock() }
        guard active else { throw MatrixWorkspaceError.sessionClosed }
        try validate(session)
        let data = try JSONEncoder().encode(Record(session))
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        let status = updated == errSecItemNotFound
            ? SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil) : updated
        guard status == errSecSuccess else { throw MatrixWorkspaceError.keychain(status) }
    }

    private func validate(_ session: Session) throws {
        guard session.userId == config.expectedUserID, session.deviceId == deviceID,
              URL(string: session.homeserverUrl)?.host == config.homeserverURL.host,
              URL(string: session.homeserverUrl)?.port == config.homeserverURL.port,
              URL(string: session.homeserverUrl)?.scheme == "https",
              ["", "/"].contains(URL(string: session.homeserverUrl)?.path ?? "invalid"),
              URL(string: session.homeserverUrl)?.user == nil, URL(string: session.homeserverUrl)?.password == nil,
              URL(string: session.homeserverUrl)?.query == nil, URL(string: session.homeserverUrl)?.fragment == nil else {
            throw MatrixWorkspaceError.invalidConfiguration
        }
    }

    func close() { mutex.lock(); active = false; mutex.unlock() }
    func remove() throws {
        mutex.lock(); defer { mutex.unlock() }
        guard active else { throw MatrixWorkspaceError.sessionClosed }
        var result: AnyObject?
        let read = SecItemCopyMatching(query.merging([
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne
        ]) { $1 } as CFDictionary, &result)
        if read == errSecItemNotFound { active = false; return }
        guard read == errSecSuccess, let data = result as? Data else { throw MatrixWorkspaceError.keychain(read) }
        // A stale logout operation must not remove a subsequently created device.
        try validate(JSONDecoder().decode(Record.self, from: data).session)
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw MatrixWorkspaceError.keychain(status) }
        active = false
    }
}
