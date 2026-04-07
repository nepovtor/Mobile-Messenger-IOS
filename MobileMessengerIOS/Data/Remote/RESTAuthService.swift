import Foundation

public protocol AuthNetworking: Sendable {
    func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse?
    func verifyCode(
        method: AuthMethod,
        contact: String,
        code: String,
        displayName: String?
    ) async throws -> AuthVerifyResponse
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

    public func verifyCode(
        method: AuthMethod,
        contact: String,
        code: String,
        displayName: String?
    ) async throws -> AuthVerifyResponse {
        var payload = [
            "method": method.rawValue,
            "contact": contact,
            "code": code
        ]
        if let displayName, !displayName.isEmpty {
            payload["displayName"] = displayName
        }

        return try await sendRequest(endpoint: "/auth/verify", payload: payload)
    }

    private func sendRequest<Response: Decodable>(endpoint: String, payload: [String: String]) async throws -> Response {
        var request = URLRequest(url: endpointURL(endpoint))
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
                try validate(httpResponse: httpResponse)
                return try Self.makeJSONDecoder().decode(Response.self, from: data)
            } catch {
                lastError = error
                attempt += 1
                let delay = pow(2.0, Double(attempt))
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        } while attempt < maxAttempts

        throw lastError ?? AppError.unknown
    }

    private func endpointURL(_ endpoint: String) -> URL {
        endpoint
            .split(separator: "/")
            .reduce(baseURL) { partialURL, component in
                partialURL.appendingPathComponent(String(component))
            }
    }

    private func validate(httpResponse: HTTPURLResponse) throws {
        switch httpResponse.statusCode {
        case 200..<300:
            return
        case 401:
            throw AppError.unauthorized
        default:
            throw AppError.network(description: "Ошибка сервера \(httpResponse.statusCode)")
        }
    }

    private static func makeJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
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

// MARK: - Chat Networking

public protocol ChatNetworking: Sendable {
    func listChats() async throws -> [ChatDTO]
    func getMessages(chatID: UUID) async throws -> [MessageDTO]
    func sendMessage(chatID: UUID, text: String, messageID: UUID) async throws -> MessageDTO
}

public struct ChatDTO: Codable, Identifiable {
    public let id: UUID
    public let title: String
    public let lastMessagePreview: String?
    public let lastActivity: Date
    
    public init(id: UUID, title: String, lastMessagePreview: String?, lastActivity: Date) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.lastActivity = lastActivity
    }
}

public struct MessageDTO: Codable, Identifiable {
    public let id: UUID
    public let messageID: UUID
    public let text: String
    public let authorID: UUID
    public let authorName: String
    public let createdAt: Date
    public let status: String
    
    public init(id: UUID, messageID: UUID, text: String, authorID: UUID, authorName: String, createdAt: Date, status: String) {
        self.id = id
        self.messageID = messageID
        self.text = text
        self.authorID = authorID
        self.authorName = authorName
        self.createdAt = createdAt
        self.status = status
    }
}

public struct RESTChatService: ChatNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: @Sendable () -> String?

    public init(baseURL: URL, session: URLSession = .shared, tokenProvider: @escaping @Sendable () -> String? = { nil }) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    private func authorizedRequest(for url: URL, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    public func listChats() async throws -> [ChatDTO] {
        let url = endpointURL("chats")
        let request = authorizedRequest(for: url)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.network(description: "Некорректный ответ сервера")
        }
        try validate(httpResponse: httpResponse, fallbackDescription: "Ошибка получения списка чатов")
        return try Self.makeJSONDecoder().decode([ChatDTO].self, from: data)
    }

    public func getMessages(chatID: UUID) async throws -> [MessageDTO] {
        let url = endpointURL("chats/\(canonicalUUID(chatID))/messages")
        let request = authorizedRequest(for: url)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.network(description: "Некорректный ответ сервера")
        }
        try validate(httpResponse: httpResponse, fallbackDescription: "Ошибка получения сообщений")
        return try Self.makeJSONDecoder().decode([MessageDTO].self, from: data)
    }

    public func sendMessage(chatID: UUID, text: String, messageID: UUID) async throws -> MessageDTO {
        let url = endpointURL("chats/\(canonicalUUID(chatID))/messages")
        var request = authorizedRequest(for: url, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload = [
            "text": text,
            "messageID": canonicalUUID(messageID)
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.network(description: "Некорректный ответ сервера")
        }
        try validate(httpResponse: httpResponse, fallbackDescription: "Ошибка отправки сообщения")
        return try Self.makeJSONDecoder().decode(MessageDTO.self, from: data)
    }

    private func endpointURL(_ path: String) -> URL {
        path
            .split(separator: "/")
            .reduce(baseURL) { partialURL, component in
                partialURL.appendingPathComponent(String(component))
            }
    }

    private func canonicalUUID(_ uuid: UUID) -> String {
        uuid.uuidString.lowercased()
    }

    private func validate(httpResponse: HTTPURLResponse, fallbackDescription: String) throws {
        switch httpResponse.statusCode {
        case 200..<300:
            return
        case 401:
            throw AppError.unauthorized
        default:
            throw AppError.network(description: fallbackDescription)
        }
    }

    private static func makeJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
