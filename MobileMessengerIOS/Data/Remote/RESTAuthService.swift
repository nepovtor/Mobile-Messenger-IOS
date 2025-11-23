import Foundation

public protocol AuthNetworking: Sendable {
    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse?
    func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse
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
                    throw AppError.network(description: "Некорректный ответ сервера")
                }
                guard 200..<300 ~= httpResponse.statusCode else {
                    throw AppError.network(description: "Ошибка сервера \(httpResponse.statusCode)")
                }
                return try JSONDecoder().decode(Response.self, from: data)
            } catch {
                lastError = error
                attempt += 1
                let delay = pow(2.0, Double(attempt))
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        } while attempt < maxAttempts

        throw lastError ?? AppError.unknown
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
