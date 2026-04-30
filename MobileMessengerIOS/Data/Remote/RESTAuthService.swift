import Foundation

struct APIResponseParser {
    static let invalidResponseMessage = "Server returned an invalid response."
    static let backendUnavailableMessage = "Backend is unavailable. Please try again later."
    static let configurationFailureMessage = "Request failed. Please check API configuration."

    struct ParseError: LocalizedError, Sendable {
        let userMessage: String
        let technicalDetails: String?
        let isRetryable: Bool
        let statusCode: Int?
        let backendCode: String?

        var errorDescription: String? {
            userMessage
        }

        init(
            userMessage: String,
            technicalDetails: String? = nil,
            isRetryable: Bool = false,
            statusCode: Int? = nil,
            backendCode: String? = nil
        ) {
            self.userMessage = userMessage
            self.technicalDetails = technicalDetails
            self.isRetryable = isRetryable
            self.statusCode = statusCode
            self.backendCode = backendCode
        }
    }

    private struct ResponseEnvelope {
        let data: Data
        let response: HTTPURLResponse
        let url: String
        let contentType: String
        let responseText: String
        let preview: String
    }

    static func requestJSON<T: Decodable>(
        _ request: URLRequest,
        using session: URLSession,
        decoder: JSONDecoder = JSONDecoder()
    ) async throws -> T {
        let envelope = try await load(request: request, using: session)
        try validateSuccessfulStatus(envelope)
        return try decodeJSON(T.self, from: envelope, decoder: decoder)
    }

    static func requestData(_ request: URLRequest, using session: URLSession) async throws -> Data {
        let envelope = try await load(request: request, using: session)
        try validateSuccessfulStatus(envelope)
        return envelope.data
    }

    static func uploadData(
        _ body: Data,
        with request: URLRequest,
        using session: URLSession
    ) async throws -> HTTPURLResponse {
        let envelope = try await loadUpload(body: body, request: request, using: session)
        try validateSuccessfulStatus(envelope)
        return envelope.response
    }

    static func isRetryable(_ error: Error) -> Bool {
        if let parseError = error as? ParseError {
            return parseError.isRetryable
        }

        guard let urlError = error as? URLError else {
            return false
        }

        switch urlError.code {
        case .timedOut,
             .cannotConnectToHost,
             .networkConnectionLost,
             .notConnectedToInternet,
             .resourceUnavailable,
             .internationalRoamingOff,
             .callIsActive,
             .dataNotAllowed:
            return true
        default:
            return false
        }
    }

    private static func load(
        request: URLRequest,
        using session: URLSession
    ) async throws -> ResponseEnvelope {
        do {
            let (data, response) = try await session.data(for: request)
            return try makeEnvelope(data: data, response: response, fallbackURL: request.url)
        } catch {
            throw transportError(from: error, request: request)
        }
    }

    private static func loadUpload(
        body: Data,
        request: URLRequest,
        using session: URLSession
    ) async throws -> ResponseEnvelope {
        do {
            let (data, response) = try await session.upload(for: request, from: body)
            return try makeEnvelope(data: data, response: response, fallbackURL: request.url)
        } catch {
            throw transportError(from: error, request: request)
        }
    }

    private static func makeEnvelope(
        data: Data,
        response: URLResponse,
        fallbackURL: URL?
    ) throws -> ResponseEnvelope {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ParseError(
                userMessage: invalidResponseMessage,
                technicalDetails: "Missing HTTPURLResponse. URL: \(fallbackURL?.absoluteString ?? "unknown")",
                isRetryable: true
            )
        }

        let url = httpResponse.url?.absoluteString ?? fallbackURL?.absoluteString ?? "unknown"
        let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") ?? "unknown"
        let responseText = data.isEmpty ? "" : String(decoding: data, as: UTF8.self)
        let preview = responseText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(160)

        return ResponseEnvelope(
            data: data,
            response: httpResponse,
            url: url,
            contentType: contentType,
            responseText: responseText,
            preview: String(preview)
        )
    }

    private static func validateSuccessfulStatus(_ envelope: ResponseEnvelope) throws {
        let statusCode = envelope.response.statusCode
        guard 200..<300 ~= statusCode else {
            let backendPayload = extractBackendError(from: envelope)
            let parseError = ParseError(
                userMessage: backendPayload.message ?? userMessage(forStatusCode: statusCode),
                technicalDetails: technicalDetails(reason: "HTTP status was not successful", envelope: envelope),
                isRetryable: statusCode >= 500,
                statusCode: statusCode,
                backendCode: backendPayload.code
            )
            logDebugInfo(parseError)
            throw parseError
        }
    }

    private static func decodeJSON<T: Decodable>(
        _ type: T.Type,
        from envelope: ResponseEnvelope,
        decoder: JSONDecoder
    ) throws -> T {
        if envelope.data.isEmpty {
            let parseError = ParseError(
                userMessage: invalidResponseMessage,
                technicalDetails: technicalDetails(reason: "Response body was empty", envelope: envelope)
            )
            logDebugInfo(parseError)
            throw parseError
        }

        if looksLikeHTML(envelope) {
            let parseError = ParseError(
                userMessage: envelope.response.statusCode >= 500 ? backendUnavailableMessage : invalidResponseMessage,
                technicalDetails: technicalDetails(reason: "Received HTML instead of JSON", envelope: envelope),
                isRetryable: envelope.response.statusCode >= 500,
                statusCode: envelope.response.statusCode
            )
            logDebugInfo(parseError)
            throw parseError
        }

        guard isJSONContent(envelope.contentType) || looksLikeJSON(envelope.responseText) else {
            let parseError = ParseError(
                userMessage: invalidResponseMessage,
                technicalDetails: technicalDetails(reason: "Response was not JSON", envelope: envelope)
            )
            logDebugInfo(parseError)
            throw parseError
        }

        do {
            return try decoder.decode(T.self, from: envelope.data)
        } catch {
            let parseError = ParseError(
                userMessage: invalidResponseMessage,
                technicalDetails: technicalDetails(
                    reason: "JSON decoding failed: \(summarizeDecodingError(error))",
                    envelope: envelope
                )
            )
            logDebugInfo(parseError)
            throw parseError
        }
    }

    private static func transportError(from error: Error, request: URLRequest) -> ParseError {
        if let parseError = error as? ParseError {
            return parseError
        }

        let url = request.url?.absoluteString ?? "unknown"
        if let urlError = error as? URLError {
            let parseError = ParseError(
                userMessage: userMessage(for: urlError),
                technicalDetails: "Transport failure. URL: \(url), code: \(urlError.code.rawValue), description: \(urlError.localizedDescription)",
                isRetryable: isRetryable(urlError)
            )
            logDebugInfo(parseError)
            return parseError
        }

        let parseError = ParseError(
            userMessage: invalidResponseMessage,
            technicalDetails: "Unexpected transport failure. URL: \(url), error: \(String(describing: error))"
        )
        logDebugInfo(parseError)
        return parseError
    }

    private static func isJSONContent(_ contentType: String) -> Bool {
        let lower = contentType.lowercased()
        return lower.contains("application/json") || lower.contains("+json")
    }

    private static func looksLikeHTML(_ envelope: ResponseEnvelope) -> Bool {
        let lowerContentType = envelope.contentType.lowercased()
        if lowerContentType.contains("text/html") {
            return true
        }

        let trimmed = envelope.responseText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        return trimmed.hasPrefix("<!doctype html") || trimmed.hasPrefix("<html") || trimmed.hasPrefix("<body")
    }

    private static func looksLikeJSON(_ text: String) -> Bool {
        guard let firstCharacter = text.trimmingCharacters(in: .whitespacesAndNewlines).first else {
            return false
        }
        return firstCharacter == "{" || firstCharacter == "["
    }

    private static func sanitizePreview(_ preview: String) -> String {
        preview
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func technicalDetails(reason: String, envelope: ResponseEnvelope) -> String {
        let preview = sanitizePreview(envelope.preview)
        return "Reason: \(reason), status: \(envelope.response.statusCode), url: \(envelope.url), content-type: \(envelope.contentType), preview: \(preview)"
    }

    private static func userMessage(for urlError: URLError) -> String {
        switch urlError.code {
        case .badURL, .unsupportedURL, .cannotFindHost, .dnsLookupFailed:
            return configurationFailureMessage
        case .timedOut,
             .cannotConnectToHost,
             .networkConnectionLost,
             .notConnectedToInternet,
             .resourceUnavailable,
             .secureConnectionFailed,
             .serverCertificateHasBadDate,
             .serverCertificateUntrusted,
             .serverCertificateHasUnknownRoot,
             .serverCertificateNotYetValid:
            return backendUnavailableMessage
        default:
            return invalidResponseMessage
        }
    }

    private static func userMessage(forStatusCode statusCode: Int) -> String {
        switch statusCode {
        case 500...599:
            return backendUnavailableMessage
        case 400...499:
            return invalidResponseMessage
        default:
            return invalidResponseMessage
        }
    }

    private static func extractBackendError(from envelope: ResponseEnvelope) -> (message: String?, code: String?) {
        guard let object = try? JSONSerialization.jsonObject(with: envelope.data) as? [String: Any] else {
            return (nil, nil)
        }

        let code = object["code"] as? String
        if let message = object["message"] as? String {
            return (message, code)
        }

        if let messages = object["message"] as? [String], let first = messages.first {
            return (first, code)
        }

        return (nil, code)
    }

    private static func summarizeDecodingError(_ error: Error) -> String {
        if let decodingError = error as? DecodingError {
            switch decodingError {
            case .keyNotFound(let key, _):
                return "Missing field: \(key.stringValue)"
            case .valueNotFound(let type, _):
                return "Missing value for type: \(type)"
            case .typeMismatch(let type, _):
                return "Type mismatch for \(type)"
            case .dataCorrupted(_):
                return "Data is corrupted"
            @unknown default:
                return "Unknown decoding error"
            }
        }

        return String(describing: error)
    }

    private static func logDebugInfo(_ error: ParseError) {
        #if DEBUG
        guard let technicalDetails = error.technicalDetails,
              let summaryData = "[API] \(error.userMessage)\n[API] \(technicalDetails)\n".data(using: .utf8) else {
            return
        }
        FileHandle.standardError.write(summaryData)
        #endif
    }
}

extension URL {
    func appendingAPIPath(_ path: String) -> URL {
        let normalizedBasePath = pathComponents.filter { $0 != "/" }
        let additionalComponents = path
            .split(separator: "/")
            .map(String.init)

        var components = URLComponents(url: self, resolvingAgainstBaseURL: false)
        components?.path = "/" + (normalizedBasePath + additionalComponents).joined(separator: "/")
        return components?.url ?? appendingPathComponent(path)
    }
}

extension JSONDecoder {
    static func mobileMessengerISO8601() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            for options in [
                ISO8601DateFormatter.Options.withInternetDateTime,
                [.withInternetDateTime, .withFractionalSeconds]
            ] {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = options
                if let date = formatter.date(from: value) {
                    return date
                }
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO-8601 date: \(value)"
            )
        }
        return decoder
    }
}

public protocol AuthNetworking: Sendable {
    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse
    func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse
    func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse
}

public struct RESTAuthService: AuthNetworking {
    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse {
        try await sendRequest(endpoint: "/auth/request", payload: [
            "method": method.rawValue,
            "contact": contact
        ])
    }

    public func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        try await sendRequest(endpoint: "/auth/verify", payload: [
            "method": method.rawValue,
            "contact": contact,
            "code": code
        ])
    }

    public func signIn(method: AuthMethod, contact: String, password: String) async throws -> AuthVerifyResponse {
        try await sendRequest(endpoint: "/auth/login", payload: [
            "method": method.rawValue,
            "contact": contact,
            "password": password
        ])
    }

    private func sendRequest<Response: Decodable>(endpoint: String, payload: [String: String]) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingAPIPath(endpoint))
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var attempt = 0
        let maxAttempts = 3
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

public struct AuthVerifyResponse: Decodable {
    public let token: String
    public let userID: UUID
    public let displayName: String
    public let phone: String?

    enum CodingKeys: String, CodingKey {
        case token
        case userID
        case userId
        case displayName
        case phone
        case contact
    }

    public init(token: String, userID: UUID, displayName: String, phone: String? = nil) {
        self.token = token
        self.userID = userID
        self.displayName = displayName
        self.phone = phone
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        token = try container.decode(String.self, forKey: .token)
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
        var request = URLRequest(url: baseURL.appendingAPIPath("contacts"))
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
        var request = URLRequest(url: baseURL.appendingAPIPath("contacts"))
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
        var request = URLRequest(url: baseURL.appendingAPIPath("contacts/\(id.uuidString)"))
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
        var request = URLRequest(url: baseURL.appendingAPIPath("auth/me"))
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
        var request = URLRequest(url: baseURL.appendingAPIPath("users/me/profile"))
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

private struct EmptyResponse: Codable {}
