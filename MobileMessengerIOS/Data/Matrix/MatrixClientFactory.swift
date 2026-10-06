import CryptoKit
import Foundation
import MatrixRustSDK
import Security

/// Prepares an encrypted, device-local Matrix store. Authentication and message
/// routing are deliberately separate: a NestJS access token is never a Matrix
/// credential, and this factory does not enable legacy chat sends.
public actor MatrixClientFactory {
    public enum StoreError: Error {
        case invalidHomeserver
        case invalidIdentity
        case keyUnavailable(OSStatus)
        case missingStoreKey
    }

    private let fileManager: FileManager
    private let keychainService = "com.mobilemessenger.matrix.store.v1"

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    public func makeClient(homeserverURL: URL, userID: String, deviceID: String) async throws -> Client {
        guard homeserverURL.scheme == "https", homeserverURL.host != nil,
              homeserverURL.user == nil, homeserverURL.password == nil,
              homeserverURL.query == nil, homeserverURL.fragment == nil else {
            throw StoreError.invalidHomeserver
        }
        guard !userID.isEmpty, !deviceID.isEmpty else {
            throw StoreError.invalidIdentity
        }

        let identity = Data("\(homeserverURL.absoluteString)\u{0}\(userID)\u{0}\(deviceID)".utf8)
        let storeID = SHA256.hash(data: identity).map { String(format: "%02x", $0) }.joined()
        let dataPath = URL.applicationSupportDirectory
            .appending(path: "Matrix", directoryHint: .isDirectory)
            .appending(path: storeID, directoryHint: .isDirectory)
        let cachePath = URL.cachesDirectory
            .appending(path: "Matrix", directoryHint: .isDirectory)
            .appending(path: storeID, directoryHint: .isDirectory)

        let existed = fileManager.fileExists(atPath: dataPath.path)
        let storeKey = try loadOrCreateStoreKey(account: storeID, existingStore: existed)
        try prepareDirectory(dataPath)
        try prepareDirectory(cachePath)

        let store = SqliteStoreBuilder(
            dataPath: dataPath.path,
            cachePath: cachePath.path
        ).key(key: storeKey)
        return try await ClientBuilder()
            .homeserverUrl(url: homeserverURL.absoluteString)
            .sqliteStore(config: store)
            .build()
    }

    private func prepareDirectory(_ directory: URL) throws {
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        var protectedDirectory = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try protectedDirectory.setResourceValues(values)
    }

    private func loadOrCreateStoreKey(account: String, existingStore: Bool) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(
            query.merging([
                kSecReturnData as String: kCFBooleanTrue!,
                kSecMatchLimit as String: kSecMatchLimitOne
            ]) { $1 } as CFDictionary,
            &result
        )
        if status == errSecSuccess {
            guard let key = result as? Data, key.count == 32 else {
                throw StoreError.missingStoreKey
            }
            return key
        }
        guard status == errSecItemNotFound else {
            throw StoreError.keyUnavailable(status)
        }
        guard !existingStore else {
            throw StoreError.missingStoreKey
        }

        var key = Data(count: 32)
        let randomStatus = key.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, bytes.count, bytes.baseAddress!)
        }
        guard randomStatus == errSecSuccess else {
            throw StoreError.keyUnavailable(randomStatus)
        }
        let addStatus = SecItemAdd(
            query.merging([
                kSecValueData as String: key,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            ]) { $1 } as CFDictionary,
            nil
        )
        guard addStatus == errSecSuccess else {
            throw StoreError.keyUnavailable(addStatus)
        }
        return key
    }
}
