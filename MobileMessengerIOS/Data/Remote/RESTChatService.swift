import Foundation

public struct ServerChat: Codable, Sendable {
    public let id: UUID
    public let title: String
    public let lastMessagePreview: String?
    public let lastActivity: Date
    public let unreadCount: Int
    public let typingParticipants: [String]
    public let participantNames: [String]
    public let participantCount: Int

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case lastMessagePreview
        case lastActivity
        case unreadCount
        case typingParticipants
        case participantNames
        case participantCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        lastMessagePreview = try container.decodeIfPresent(String.self, forKey: .lastMessagePreview)
        lastActivity = try container.decode(Date.self, forKey: .lastActivity)
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        typingParticipants = try container.decodeIfPresent([String].self, forKey: .typingParticipants) ?? []
        participantNames = try container.decodeIfPresent([String].self, forKey: .participantNames) ?? []

        let decodedParticipantCount = try container.decodeIfPresent(Int.self, forKey: .participantCount)
        participantCount = max(decodedParticipantCount ?? (participantNames.isEmpty ? 1 : participantNames.count + 1), 1)
    }
}

public struct ServerMessage: Codable, Sendable {
    public let id: UUID
    public let messageID: UUID
    public let chatID: UUID
    public let authorID: UUID
    public let authorName: String
    public let kind: Message.Kind
    public let text: String?
    public let mediaID: UUID?
    public let mediaURL: URL?
    public let status: MessageStatus
    public let createdAt: Date

    private enum CodingKeys: String, CodingKey {
        case id
        case messageID
        case chatID
        case authorID
        case authorName
        case kind
        case text
        case mediaID
        case mediaURL
        case status
        case createdAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        messageID = try container.decode(UUID.self, forKey: .messageID)
        chatID = try container.decode(UUID.self, forKey: .chatID)
        authorID = try container.decode(UUID.self, forKey: .authorID)
        authorName = try container.decode(String.self, forKey: .authorName)
        kind = try container.decodeIfPresent(Message.Kind.self, forKey: .kind) ?? .text
        text = try container.decodeIfPresent(String.self, forKey: .text)
        mediaID = try container.decodeIfPresent(UUID.self, forKey: .mediaID)
        mediaURL = try container.decodeIfPresent(URL.self, forKey: .mediaURL)
        status = try container.decode(MessageStatus.self, forKey: .status)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
    }

    public func asDomainMessage(localID: UUID? = nil) -> Message {
        let attachments: [MessageAttachment]
        if let mediaURL {
            attachments = [
                MessageAttachment(
                    id: mediaID ?? id,
                    kind: .image,
                    url: mediaURL,
                    localPath: nil,
                    thumbnailURL: mediaURL,
                    fileSize: nil
                )
            ]
        } else {
            attachments = []
        }

        return Message(
            id: Message.Identifier(chatID: chatID, messageID: id),
            localID: localID ?? messageID,
            authorID: authorID,
            authorName: authorName,
            kind: kind,
            text: text ?? "",
            mediaID: mediaID,
            createdAt: createdAt,
            status: status,
            attachments: attachments
        )
    }
}

public struct MediaUploadTarget: Codable, Sendable {
    public let mediaID: UUID
    public let uploadURL: URL
    public let objectKey: String
}

public protocol ChatNetworking: Sendable {
    func listChats(searchQuery: String?) async throws -> [ServerChat]
    func createChat(title: String, participantContacts: [String]) async throws -> ServerChat
    func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage]
    func sendMessage(chatID: UUID, kind: Message.Kind, text: String?, mediaID: UUID?, localID: UUID) async throws -> ServerMessage
    func markRead(chatID: UUID, messageID: UUID) async throws
    func setTyping(chatID: UUID, isTyping: Bool) async throws
    func requestUploadURL(mimeType: String, sizeBytes: Int, width: Int?, height: Int?) async throws -> MediaUploadTarget
    func uploadImage(to uploadURL: URL, data: Data, mimeType: String) async throws -> String?
    func confirmUpload(mediaID: UUID, etag: String?) async throws
}

public struct RESTChatService: ChatNetworking {
    private enum RequestDiagnosticsContext: String {
        case chatList = "chat_list"
    }

    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: @Sendable () async -> String?
    private let decoder: JSONDecoder

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        authTokenProvider: @escaping @Sendable () async -> String?
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authTokenProvider = authTokenProvider

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    public func listChats(searchQuery: String?) async throws -> [ServerChat] {
        var components = URLComponents(url: baseURL.appendingPathComponent("chats"), resolvingAgainstBaseURL: false)
        if let searchQuery, !searchQuery.isEmpty {
            components?.queryItems = [URLQueryItem(name: "search", value: searchQuery)]
        }
        guard let url = components?.url else {
            throw AppError.network(description: "Некорректный URL списка чатов")
        }
        return try await perform(
            request: authenticatedRequest(url: url),
            diagnostics: .chatList
        )
    }

    public func createChat(title: String, participantContacts: [String]) async throws -> ServerChat {
        var request = try await authorizedRequest(path: "chats", method: "POST")
        let normalizedContacts = participantContacts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        request.httpBody = try encode([
            "title": title,
            "participantContacts": normalizedContacts.isEmpty ? nil : normalizedContacts
        ])
        return try await perform(request: request)
    }

    public func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage] {
        var components = URLComponents(url: baseURL.appendingPathComponent("chats/\(chatID.uuidString)/messages"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let messageID {
            components?.queryItems?.append(URLQueryItem(name: "before", value: messageID.uuidString))
        }
        guard let url = components?.url else {
            throw AppError.network(description: "Некорректный URL истории сообщений")
        }
        return try await perform(request: authenticatedRequest(url: url))
    }

    public func sendMessage(chatID: UUID, kind: Message.Kind, text: String?, mediaID: UUID?, localID: UUID) async throws -> ServerMessage {
        var request = try await authorizedRequest(path: "chats/\(chatID.uuidString)/messages", method: "POST")
        request.httpBody = try encode([
            "messageID": localID.uuidString,
            "kind": kind.rawValue,
            "text": text,
            "mediaID": mediaID?.uuidString
        ])
        return try await perform(request: request)
    }

    public func markRead(chatID: UUID, messageID: UUID) async throws {
        let request = try await authorizedRequest(path: "chats/\(chatID.uuidString)/messages/\(messageID.uuidString)/read", method: "POST")
        _ = try await performRaw(request: request)
    }

    public func setTyping(chatID: UUID, isTyping: Bool) async throws {
        var request = try await authorizedRequest(path: "chats/\(chatID.uuidString)/typing", method: "POST")
        request.httpBody = try encode(["isTyping": isTyping])
        _ = try await performRaw(request: request)
    }

    public func requestUploadURL(mimeType: String, sizeBytes: Int, width: Int?, height: Int?) async throws -> MediaUploadTarget {
        var request = try await authorizedRequest(path: "media/upload-url", method: "POST")
        request.httpBody = try encode([
            "mimeType": mimeType,
            "sizeBytes": sizeBytes,
            "width": width,
            "height": height
        ])
        return try await perform(request: request)
    }

    public func uploadImage(to uploadURL: URL, data: Data, mimeType: String) async throws -> String? {
        var request = URLRequest(url: uploadURL)
        request.httpMethod = "PUT"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")

        let (_, response) = try await session.upload(for: request, from: data)
        guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
            throw AppError.network(description: "Не удалось загрузить изображение")
        }
        return httpResponse.value(forHTTPHeaderField: "ETag")
    }

    public func confirmUpload(mediaID: UUID, etag: String?) async throws {
        var request = try await authorizedRequest(path: "media/\(mediaID.uuidString)/confirm", method: "POST")
        request.httpBody = try encode(["etag": etag])
        _ = try await performRaw(request: request)
    }

    private func perform<Response: Decodable>(
        request: URLRequest,
        diagnostics: RequestDiagnosticsContext? = nil
    ) async throws -> Response {
        let (data, response) = try await performData(request: request, diagnostics: diagnostics)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            logDiagnostics(
                context: diagnostics,
                request: request,
                response: response,
                body: data,
                error: error
            )
            if diagnostics == .chatList {
                throw AppError.network(description: "Сервер вернул неподдерживаемый формат списка чатов")
            }
            throw error
        }
    }

    private func performRaw(request: URLRequest) async throws -> Data {
        let (data, _) = try await performData(request: request)
        return data
    }

    private func performData(
        request: URLRequest,
        diagnostics: RequestDiagnosticsContext? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                let error = AppError.network(description: "Некорректный ответ сервера")
                logDiagnostics(
                    context: diagnostics,
                    request: request,
                    response: nil,
                    body: data,
                    error: error
                )
                throw error
            }

            if httpResponse.statusCode == 401 {
                logDiagnostics(
                    context: diagnostics,
                    request: request,
                    response: httpResponse,
                    body: data,
                    error: AppError.unauthorized
                )
                throw AppError.unauthorized
            }

            guard 200..<300 ~= httpResponse.statusCode else {
                let message = String(data: data, encoding: .utf8) ?? "Ошибка \(httpResponse.statusCode)"
                let error = AppError.network(description: message)
                logDiagnostics(
                    context: diagnostics,
                    request: request,
                    response: httpResponse,
                    body: data,
                    error: error
                )
                throw error
            }

            return (data, httpResponse)
        } catch let urlError as URLError {
            logDiagnostics(
                context: diagnostics,
                request: request,
                response: nil,
                body: nil,
                error: urlError
            )
            if diagnostics == .chatList {
                throw AppError.network(
                    description: "Не удалось выполнить запрос списка чатов: \(urlError.localizedDescription)"
                )
            }
            throw urlError
        } catch {
            throw error
        }
    }

    private func authorizedRequest(path: String, method: String = "GET") async throws -> URLRequest {
        authorizedRequest(url: baseURL.appendingPathComponent(path), method: method, token: try await requireToken())
    }

    private func authenticatedRequest(url: URL, method: String = "GET") async throws -> URLRequest {
        authorizedRequest(url: url, method: method, token: try await requireToken())
    }

    private func authorizedRequest(url: URL, method: String = "GET", token: String? = nil) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func requireToken() async throws -> String {
        guard let token = await authTokenProvider() else {
            throw AppError.unauthorized
        }
        return token
    }

    private func encode(_ payload: [String: Any?]) throws -> Data {
        let filtered = payload.reduce(into: [String: Any]()) { result, item in
            if let value = item.value {
                result[item.key] = value
            }
        }
        return try JSONSerialization.data(withJSONObject: filtered, options: [])
    }

    private func logDiagnostics(
        context: RequestDiagnosticsContext?,
        request: URLRequest,
        response: HTTPURLResponse?,
        body: Data?,
        error: Error
    ) {
        guard let context else { return }

#if DEBUG
        let method = request.httpMethod ?? "GET"
        let url = request.url?.absoluteString ?? "n/a"
        let status = response.map { String($0.statusCode) } ?? "n/a"
        let hasAuthorization = request.value(forHTTPHeaderField: "Authorization") != nil
        let bodyPreview: String
        if let body,
           let string = String(data: body, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !string.isEmpty {
            bodyPreview = String(string.prefix(300))
        } else {
            bodyPreview = "empty"
        }

        print(
            "[RESTChatService][\(context.rawValue)] method=\(method) url=\(url) status=\(status) " +
            "authorized=\(hasAuthorization) error=\(error.localizedDescription) body=\(bodyPreview)"
        )
#endif
    }
}
