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
                    id: mediaID ?? messageID,
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
            id: Message.Identifier(chatID: chatID, messageID: messageID),
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
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            if let date = Self.fractionalSecondDateFormatter.date(from: value)
                ?? Self.iso8601DateFormatter.date(from: value) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO-8601 date: \(value)"
            )
        }
        self.decoder = decoder
    }

    private static let iso8601DateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fractionalSecondDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    public func listChats(searchQuery: String?) async throws -> [ServerChat] {
        var components = URLComponents(url: baseURL.appendingPathComponent("chats"), resolvingAgainstBaseURL: false)
        if let searchQuery, !searchQuery.isEmpty {
            components?.queryItems = [URLQueryItem(name: "search", value: searchQuery)]
        }
        guard let url = components?.url else {
            throw AppError.network(description: "Некорректный URL списка чатов")
        }
        return try await perform(request: authorizedRequest(url: url))
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
        return try await perform(request: authorizedRequest(url: url))
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

    private func perform<Response: Decodable>(request: URLRequest) async throws -> Response {
        let data = try await performRaw(request: request)
        return try decoder.decode(Response.self, from: data)
    }

    private func performRaw(request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.network(description: "Некорректный ответ сервера")
        }
        if httpResponse.statusCode == 401 {
            throw AppError.unauthorized
        }
        guard 200..<300 ~= httpResponse.statusCode else {
            let message = String(data: data, encoding: .utf8) ?? "Ошибка \(httpResponse.statusCode)"
            throw AppError.network(description: message)
        }
        return data
    }

    private func authorizedRequest(path: String, method: String = "GET") async throws -> URLRequest {
        try await authorizedRequest(url: baseURL.appendingPathComponent(path), method: method)
    }

    private func authorizedRequest(url: URL, method: String = "GET") async throws -> URLRequest {
        try await AuthorizedRequestFactory.makeRequest(
            url: url,
            method: method,
            authTokenProvider: authTokenProvider
        )
    }

    private func encode(_ payload: [String: Any?]) throws -> Data {
        let filtered = payload.reduce(into: [String: Any]()) { result, item in
            if let value = item.value {
                result[item.key] = value
            }
        }
        return try JSONSerialization.data(withJSONObject: filtered, options: [])
    }
}

extension ServerChat {
    func asDomainChat() throws -> Chat {
        Chat(
            id: id,
            title: title,
            lastMessagePreview: lastMessagePreview,
            lastActivity: lastActivity,
            unreadCount: unreadCount,
            typingParticipants: typingParticipants,
            participantNames: participantNames,
            participantCount: participantCount
        )
    }
}
