import Foundation

public protocol AuthNetworking: Sendable {
    func requestTelegramPairing(phone: String) async throws -> TelegramPairingResponse
    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse
    func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse
    func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse
}

public struct RESTAuthService: AuthNetworking {
    public static let clientPlatform = "ios"
    public static let genericDeviceName = "Mobile Messenger iOS"

    private let baseURL: URL
    private let session: URLSession
    private let deviceID: String
    private let deviceName: String

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        deviceID: String = KeychainDeviceIdentifierStore.shared.retrieveOrCreateIdentifier(),
        deviceName: String = RESTAuthService.genericDeviceName
    ) {
        self.baseURL = baseURL
        self.session = session
        self.deviceID = deviceID
        self.deviceName = deviceName
    }

    public func requestTelegramPairing(phone: String) async throws -> TelegramPairingResponse {
        try await sendRequest(
            endpoint: GeneratedAPIContract.path(.authTelegramPairing),
            payload: ["phone": phone]
        )
    }

    public func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse {
        try await sendRequest(endpoint: GeneratedAPIContract.path(.authRequest), payload: [
            "method": method.rawValue,
            "contact": contact
        ])
    }

    public func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        try await sendRequest(endpoint: GeneratedAPIContract.path(.authVerify), payload: [
            "method": method.rawValue,
            "contact": contact,
            "code": code
        ])
    }

    public func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse {
        try await sendRequest(endpoint: GeneratedAPIContract.path(.authLogin), payload: [
            "method": method.rawValue,
            "contact": contact,
            "password": password
        ])
    }

    public func refresh(refreshToken: String) async throws -> AuthVerifyResponse {
        try await sendRequest(
            endpoint: "auth/refresh",
            payload: ["refreshToken": refreshToken],
            maxAttempts: 1
        )
    }

    public func logout(refreshToken: String) async throws {
        var request = URLRequest(url: baseURL.appendingAPIPath("auth/logout"))
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(
            withJSONObject: ["refreshToken": refreshToken],
            options: []
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Self.clientPlatform, forHTTPHeaderField: "X-Client-Platform")
        request.setValue(deviceID, forHTTPHeaderField: "X-Device-ID")
        request.setValue(deviceName, forHTTPHeaderField: "X-Device-Name")
        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.userAuthenticationRequired)
        }
    }

    private func sendRequest<Response: Decodable>(
        endpoint: String,
        payload: [String: String],
        includesDeviceIdentity: Bool = true,
        maxAttempts: Int = 3
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingAPIPath(endpoint))
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if includesDeviceIdentity {
            request.setValue(Self.clientPlatform, forHTTPHeaderField: "X-Client-Platform")
            request.setValue(deviceID, forHTTPHeaderField: "X-Device-ID")
            request.setValue(deviceName, forHTTPHeaderField: "X-Device-Name")
        }

        var attempt = 0
        var lastError: Error?

        repeat {
            do {
                return try await APIResponseParser.requestJSON(
                    request,
                    using: session,
                    decoder: JSONDecoder()
                )
            } catch {
                lastError = error
                if !shouldRetry(after: error) {
                    break
                }
                attempt += 1
                guard attempt < maxAttempts else { break }
                let delay = pow(2.0, Double(attempt))
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        } while attempt < maxAttempts

        throw AppError.wrapped(lastError ?? AppError.unknown)
    }

    private func shouldRetry(after error: Error) -> Bool {
        APIResponseParser.isRetryable(error)
    }
}

public enum AuthMethod: String, Codable {
    case phone
    case email
}

public struct AuthCodeResponse: Codable {
    public let status: String
    public let delivery: String
    public let resendAfterSeconds: Int
    public let expiresIn: Int
    public let debugCode: String?

    enum CodingKeys: String, CodingKey {
        case status
        case delivery
        case resendAfterSeconds
        case expiresIn
        case debugCode
    }

    public init(
        status: String,
        delivery: String,
        resendAfterSeconds: Int,
        expiresIn: Int,
        debugCode: String? = nil
    ) {
        self.status = status
        self.delivery = delivery
        self.resendAfterSeconds = resendAfterSeconds
        self.expiresIn = expiresIn
        self.debugCode = debugCode
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "code_sent"
        delivery = try container.decodeIfPresent(String.self, forKey: .delivery) ?? "telegram"
        resendAfterSeconds = try container.decodeIfPresent(Int.self, forKey: .resendAfterSeconds) ?? 60
        expiresIn = try container.decodeIfPresent(Int.self, forKey: .expiresIn) ?? 300
        debugCode = try container.decodeIfPresent(String.self, forKey: .debugCode)
    }
}

public struct TelegramPairingResponse: Codable, Sendable {
    public let botUsername: String
    public let telegramStartUrl: String
    public let expiresIn: Int

    public var startURL: URL? {
        URL(string: telegramStartUrl)
    }
}

public struct AuthVerifyResponse: Decodable {
    public let token: String
    public let refreshToken: String?
    public let userID: UUID
    public let displayName: String
    public let phone: String?

    enum CodingKeys: String, CodingKey {
        case token
        case refreshToken
        case userID
        case userId
        case displayName
        case phone
        case contact
    }

    public init(
        token: String,
        refreshToken: String? = nil,
        userID: UUID,
        displayName: String,
        phone: String? = nil
    ) {
        self.token = token
        self.refreshToken = refreshToken
        self.userID = userID
        self.displayName = displayName
        self.phone = phone
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        token = try container.decode(String.self, forKey: .token)
        refreshToken = try container.decodeIfPresent(String.self, forKey: .refreshToken)
        displayName = try container.decode(String.self, forKey: .displayName)
        phone =
            try container.decodeIfPresent(String.self, forKey: .phone) ??
            container.decodeIfPresent(String.self, forKey: .contact)

        if let decodedUserID = try container.decodeIfPresent(UUID.self, forKey: .userID) ??
            container.decodeIfPresent(UUID.self, forKey: .userId) {
            userID = decodedUserID
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.userID,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Missing userID/userId in auth response"
                )
            )
        }
    }
}

public protocol ContactsNetworking: Sendable {
    func listContacts() async throws -> [ContactDTO]
    func addContact(phone: String) async throws -> ContactDTO
    func removeContact(id: UUID) async throws
}

public struct ContactDTO: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let userID: UUID
    public let displayName: String
    public let phone: String
    public let createdAt: String
    public let directChatID: UUID?
    public let alreadyExists: Bool?

    public var contact: String { phone }
}

public protocol ProfileNetworking: Sendable {
    func fetchProfile() async throws -> UserProfileDTO
    func updateProfile(displayName: String) async throws -> UserProfileDTO
}

public enum PushDeviceEnvironment: String, Codable, Sendable {
    case sandbox
    case production
}

public protocol PushDeviceNetworking: Sendable {
    func registerDevice(
        token: String,
        environment: PushDeviceEnvironment,
        bundleId: String?
    ) async throws
    func deleteDevice(token: String) async throws
}

public struct UserProfileDTO: Decodable, Sendable {
    public let userID: UUID
    public let displayName: String
    public let phone: String

    private enum CodingKeys: String, CodingKey {
        case userID
        case userId
        case displayName
        case phone
        case contact
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try container.decode(String.self, forKey: .displayName)
        phone =
            try container.decodeIfPresent(String.self, forKey: .phone) ??
            (try container.decodeIfPresent(String.self, forKey: .contact)) ??
            ""

        if let decodedUserID = try container.decodeIfPresent(UUID.self, forKey: .userID) ??
            container.decodeIfPresent(UUID.self, forKey: .userId) {
            userID = decodedUserID
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.userID,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Missing userID/userId in profile response"
                )
            )
        }
    }
}

public struct RESTContactsService: ContactsNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: @Sendable () async -> String?
    private let unauthorizedHandler: @Sendable () async -> Void

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?,
        unauthorizedHandler: @escaping @Sendable () async -> Void = {}
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authTokenProvider = authTokenProvider
        self.unauthorizedHandler = unauthorizedHandler
    }

    public func listContacts() async throws -> [ContactDTO] {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.listContacts)))
        request.httpMethod = "GET"
        try await authorize(&request)

        do {
            return try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    public func addContact(phone: String) async throws -> ContactDTO {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.createContact)))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["phone": phone])
        try await authorize(&request)

        do {
            return try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    public func removeContact(id: UUID) async throws {
        var request = URLRequest(url: baseURL.appendingAPIPath(
            GeneratedAPIContract.path(.deleteContact, parameters: ["identifier": id.uuidString])
        ))
        request.httpMethod = "DELETE"
        try await authorize(&request)

        do {
            let _: EmptyResponse = try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    private func authorize(_ request: inout URLRequest) async throws {
        if let token = await authTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            throw AppError.unauthorized
        }
    }
}

public struct RESTProfileService: ProfileNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: @Sendable () async -> String?
    private let unauthorizedHandler: @Sendable () async -> Void

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?,
        unauthorizedHandler: @escaping @Sendable () async -> Void = {}
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authTokenProvider = authTokenProvider
        self.unauthorizedHandler = unauthorizedHandler
    }

    public func fetchProfile() async throws -> UserProfileDTO {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.authMe)))
        request.httpMethod = "GET"
        try await authorize(&request)

        do {
            return try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    public func updateProfile(displayName: String) async throws -> UserProfileDTO {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.updateProfile)))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["displayName": displayName])
        try await authorize(&request)

        do {
            return try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    private func authorize(_ request: inout URLRequest) async throws {
        if let token = await authTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            throw AppError.unauthorized
        }
    }
}

public struct RESTPushDeviceService: PushDeviceNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: @Sendable () async -> String?
    private let unauthorizedHandler: @Sendable () async -> Void

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?,
        unauthorizedHandler: @escaping @Sendable () async -> Void = {}
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authTokenProvider = authTokenProvider
        self.unauthorizedHandler = unauthorizedHandler
    }

    public func registerDevice(
        token: String,
        environment: PushDeviceEnvironment,
        bundleId: String?
    ) async throws {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.registerPushDevice)))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "token": token,
            "environment": environment.rawValue,
            "bundleId": bundleId,
        ])
        try await authorize(&request)

        do {
            let _: EmptyResponse = try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    public func deleteDevice(token: String) async throws {
        var request = URLRequest(
            url: baseURL.appendingAPIPath(
                GeneratedAPIContract.path(.deletePushDevice, parameters: ["token": token])
            )
        )
        request.httpMethod = "DELETE"
        try await authorize(&request)

        do {
            let _: EmptyResponse = try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: JSONDecoder()
            )
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    private func authorize(_ request: inout URLRequest) async throws {
        if let token = await authTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            throw AppError.unauthorized
        }
    }
}

private struct EmptyResponse: Codable {}
