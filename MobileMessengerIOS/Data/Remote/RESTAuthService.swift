import Foundation

public protocol AuthNetworking: Sendable {
    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse?
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

    public func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse? {
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
        var request = URLRequest(url: baseURL.appendingPathComponent(endpoint))
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var attempt = 0
        let maxAttempts = 3
        var lastError: Error?

        repeat {
            do {
                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw RequestError(description: "Некорректный ответ сервера", isRetryable: true)
                }
                guard 200..<300 ~= httpResponse.statusCode else {
                    throw RequestError(
                        description: makeErrorDescription(from: data, statusCode: httpResponse.statusCode),
                        isRetryable: httpResponse.statusCode >= 500
                    )
                }
                return try JSONDecoder().decode(Response.self, from: data)
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

        throw lastError ?? AppError.unknown
    }

    private func shouldRetry(after error: Error) -> Bool {
        if let requestError = error as? RequestError {
            return requestError.isRetryable
        }

        guard let urlError = error as? URLError else {
            return false
        }

        switch urlError.code {
        case .timedOut,
             .cannotFindHost,
             .cannotConnectToHost,
             .networkConnectionLost,
             .dnsLookupFailed,
             .notConnectedToInternet,
             .resourceUnavailable:
            return true
        default:
            return false
        }
    }

    private func makeErrorDescription(from data: Data, statusCode: Int) -> String {
        if let payload = try? JSONDecoder().decode(ServerErrorPayload.self, from: data),
           let message = payload.message,
           !message.isEmpty {
            return message
        }

        if let rawMessage = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !rawMessage.isEmpty {
            return rawMessage
        }

        return "Ошибка сервера \(statusCode)"
    }
}

private struct ServerErrorPayload: Decodable {
    let message: String?
}

private struct RequestError: LocalizedError {
    let description: String
    let isRetryable: Bool

    var errorDescription: String? {
        description
    }
}

public enum AuthMethod: String, Codable {
    case phone
    case email
}

public struct AuthCodeResponse: Codable {
    public let expiresIn: Int?
}

public struct AuthVerifyResponse: Codable {
    public let token: String
    public let userID: UUID
    public let displayName: String
}

public protocol ContactsNetworking: Sendable {
    func listContacts() async throws -> [ContactDTO]
}

public struct ContactDTO: Codable, Identifiable, Hashable, Sendable {
    public let userID: UUID
    public let displayName: String
    public let contact: String
    public let isCurrentUser: Bool

    public var id: UUID { userID }
}

public struct RESTContactsService: ContactsNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: @Sendable () async -> String?

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authTokenProvider = authTokenProvider
    }

    public func listContacts() async throws -> [ContactDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("auth/contacts"))
        request.httpMethod = "GET"
        if let token = await authTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            throw AppError.unauthorized
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.network(description: "Некорректный ответ сервера")
        }
        if httpResponse.statusCode == 401 {
            throw AppError.unauthorized
        }
        guard 200..<300 ~= httpResponse.statusCode else {
            let message = String(data: data, encoding: .utf8) ?? "Ошибка сервера \(httpResponse.statusCode)"
            throw AppError.network(description: message)
        }

        return try JSONDecoder().decode([ContactDTO].self, from: data)
    }
}
