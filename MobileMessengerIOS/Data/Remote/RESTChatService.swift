import Foundation

public struct ServerChat: Decodable, Sendable {
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
        case lastMessage
        case lastActivity
        case updatedAt
        case unreadCount
        case typingParticipants
        case participantNames
        case participants
        case participantCount
    }

    public init(
        id: UUID,
        title: String,
        lastMessagePreview: String?,
        lastActivity: Date,
        unreadCount: Int,
        typingParticipants: [String],
        participantNames: [String],
        participantCount: Int
    ) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.lastActivity = lastActivity
        self.unreadCount = unreadCount
        self.typingParticipants = typingParticipants
        self.participantNames = participantNames
        self.participantCount = participantCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        lastMessagePreview =
            try container.decodeIfPresent(String.self, forKey: .lastMessagePreview) ??
            container.decodeIfPresent(String.self, forKey: .lastMessage)
        lastActivity =
            try container.decodeIfPresent(Date.self, forKey: .lastActivity) ??
            container.decode(Date.self, forKey: .updatedAt)
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        typingParticipants = try container.decodeIfPresent([String].self, forKey: .typingParticipants) ?? []
        participantNames =
            try container.decodeIfPresent([String].self, forKey: .participantNames) ??
            container.decodeIfPresent([String].self, forKey: .participants) ?? []
        participantCount =
            try container.decodeIfPresent(Int.self, forKey: .participantCount) ??
            max(participantNames.count, 1)
    }
}

public struct ServerMessage: Decodable, Sendable {
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
    public let editedAt: Date?
    public let deletedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id
        case messageID
        case clientMessageId
        case chatID
        case senderID
        case authorID
        case authorName
        case senderName
        case kind
        case text
        case mediaID
        case mediaURL
        case status
        case createdAt
        case editedAt
        case deletedAt
    }

    public init(
        id: UUID,
        messageID: UUID,
        chatID: UUID,
        authorID: UUID,
        authorName: String,
        kind: Message.Kind,
        text: String?,
        mediaID: UUID?,
        mediaURL: URL?,
        status: MessageStatus,
        createdAt: Date,
        editedAt: Date?,
        deletedAt: Date?
    ) {
        self.id = id
        self.messageID = messageID
        self.chatID = chatID
        self.authorID = authorID
        self.authorName = authorName
        self.kind = kind
        self.text = text
        self.mediaID = mediaID
        self.mediaURL = mediaURL
        self.status = status
        self.createdAt = createdAt
        self.editedAt = editedAt
        self.deletedAt = deletedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        messageID =
            try container.decodeIfPresent(UUID.self, forKey: .messageID) ??
            container.decodeIfPresent(UUID.self, forKey: .clientMessageId) ??
            id
        chatID = try container.decode(UUID.self, forKey: .chatID)
        authorID =
            try container.decodeIfPresent(UUID.self, forKey: .authorID) ??
            container.decode(UUID.self, forKey: .senderID)
        authorName =
            try container.decodeIfPresent(String.self, forKey: .authorName) ??
            container.decodeIfPresent(String.self, forKey: .senderName) ??
            "Unknown sender"
        kind = try container.decode(Message.Kind.self, forKey: .kind)
        text = try container.decodeIfPresent(String.self, forKey: .text)
        mediaID = try container.decodeIfPresent(UUID.self, forKey: .mediaID)
        mediaURL = try container.decodeIfPresent(URL.self, forKey: .mediaURL)
        status = try container.decodeIfPresent(MessageStatus.self, forKey: .status) ?? .delivered
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        editedAt = try container.decodeIfPresent(Date.self, forKey: .editedAt)
        deletedAt = try container.decodeIfPresent(Date.self, forKey: .deletedAt)
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
            attachments: deletedAt == nil ? attachments : [],
            editedAt: editedAt,
            deletedAt: deletedAt
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
    func deleteChat(chatID: UUID) async throws
    func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage]
    func sendMessage(chatID: UUID, kind: Message.Kind, text: String?, mediaID: UUID?, localID: UUID) async throws -> ServerMessage
    func editMessage(chatID: UUID, messageID: UUID, text: String) async throws -> ServerMessage
    func deleteMessage(chatID: UUID, messageID: UUID) async throws -> ServerMessage
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
    private let unauthorizedHandler: @Sendable () async -> Void
    private let decoder: JSONDecoder

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

        self.decoder = .mobileMessengerISO8601()
    }

    public func listChats(searchQuery: String?) async throws -> [ServerChat] {
        var components = URLComponents(url: baseURL.appendingAPIPath("chats"), resolvingAgainstBaseURL: false)
        if let searchQuery, !searchQuery.isEmpty {
            components?.queryItems = [URLQueryItem(name: "search", value: searchQuery)]
        }
        guard let url = components?.url else {
            throw AppError.network(description: "Некорректный URL списка чатов")
        }
        return try await perform(request: authenticatedRequest(url: url))
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

    public func deleteChat(chatID: UUID) async throws {
        let request = try await authorizedRequest(
            path: "chats/\(chatID.uuidString)",
            method: "DELETE"
        )
        _ = try await performRaw(request: request)
    }

    public func loadMessages(chatID: UUID, limit: Int, before messageID: UUID?) async throws -> [ServerMessage] {
        var components = URLComponents(url: baseURL.appendingAPIPath("chats/\(chatID.uuidString)/messages"), resolvingAgainstBaseURL: false)
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

    public func editMessage(chatID: UUID, messageID: UUID, text: String) async throws -> ServerMessage {
        var request = try await authorizedRequest(
            path: "chats/\(chatID.uuidString)/messages/\(messageID.uuidString)",
            method: "PATCH"
        )
        request.httpBody = try encode([
            "text": text
        ])
        return try await perform(request: request)
    }

    public func deleteMessage(chatID: UUID, messageID: UUID) async throws -> ServerMessage {
        let request = try await authorizedRequest(
            path: "chats/\(chatID.uuidString)/messages/\(messageID.uuidString)",
            method: "DELETE"
        )
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

        do {
            let response = try await APIResponseParser.uploadData(
                data,
                with: request,
                using: session
            )
            return response.value(forHTTPHeaderField: "ETag")
        } catch {
            throw AppError.wrapped(error)
        }
    }

    public func confirmUpload(mediaID: UUID, etag: String?) async throws {
        var request = try await authorizedRequest(path: "media/\(mediaID.uuidString)/confirm", method: "POST")
        request.httpBody = try encode(["etag": etag])
        _ = try await performRaw(request: request)
    }

    private func perform<Response: Decodable>(request: URLRequest) async throws -> Response {
        do {
            return try await APIResponseParser.requestJSON(
                request,
                using: session,
                decoder: decoder
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

    private func performRaw(request: URLRequest) async throws -> Data {
        do {
            return try await APIResponseParser.requestData(request, using: session)
        } catch let parseError as APIResponseParser.ParseError where parseError.statusCode == 401 {
            await unauthorizedHandler()
            throw AppError.unauthorized
        } catch let parseError as APIResponseParser.ParseError {
            throw AppError.wrapped(parseError)
        } catch {
            throw AppError.wrapped(error)
        }
    }

    private func authorizedRequest(path: String, method: String = "GET") async throws -> URLRequest {
        authorizedRequest(url: baseURL.appendingAPIPath(path), method: method, token: try await requireToken())
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
}
