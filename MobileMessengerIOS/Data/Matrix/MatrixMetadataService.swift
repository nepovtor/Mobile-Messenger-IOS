import Foundation
import Security

struct NativeMatrixConfig: Codable, Sendable {
    let homeserverURL: URL
    let issuerURL: URL
    let serverName: String
    let expectedUserID: String

    func validate(owner: UUID) throws {
        for url in [homeserverURL, issuerURL] {
            guard url.scheme == "https", url.host != nil, url.user == nil, url.password == nil,
                  ["", "/"].contains(url.path), url.query == nil, url.fragment == nil else {
                throw MatrixWorkspaceError.invalidConfiguration
            }
        }
        guard homeserverURL.host != issuerURL.host,
              expectedUserID == "@u_\(owner.uuidString.replacingOccurrences(of: "-", with: "").lowercased()):\(serverName)" else {
            throw MatrixWorkspaceError.invalidConfiguration
        }
    }
}

struct NativeMatrixDescriptor: Decodable, Sendable {
    struct Participant: Decodable, Sendable {
        let userID: UUID
        let matrixUserID: String
        let displayName: String
        let active: Bool
    }
    let chatID: UUID
    let roomID: String?
    let epoch: Int
    let boundEpoch: Int?
    let participants: [Participant]

    func validate(chatID: UUID, owner: String) throws {
        let identities = participants.map(\.matrixUserID)
        guard self.chatID == chatID, epoch > 0, !identities.isEmpty, identities.count <= 128,
              Set(identities).count == identities.count, identities.contains(owner),
              participants.allSatisfy(\.active), roomID == nil || boundEpoch == epoch else {
            throw MatrixWorkspaceError.roomChanged
        }
    }
}

enum MatrixWorkspaceError: LocalizedError {
    case invalidConfiguration, roomChanged, missingNativeRegistration, keychain(OSStatus), sessionClosed
    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: return "Не удалось проверить настройки защищённой переписки"
        case .roomChanged: return "Параметры комнаты или её участники изменились. Отправка приостановлена"
        case .missingNativeRegistration: return "Вход на iPhone ещё не настроен администратором"
        case .keychain: return "Не удалось открыть или сохранить сессию устройства"
        case .sessionClosed: return "Сессия закрыта"
        }
    }
}

final class MatrixMetadataService {
    private let baseURL: URL
    private let token: @Sendable () async -> String?
    private let session: URLSession

    init(baseURL: URL, token: @escaping @Sendable () async -> String?, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    func config(owner: UUID) async throws -> NativeMatrixConfig? {
        do {
            let result: NativeMatrixConfig = try await request("matrix/config")
            try result.validate(owner: owner)
            return result
        } catch let error as APIResponseParser.ParseError where error.statusCode == 404 {
            return nil
        }
    }

    func descriptor(chatID: UUID) async throws -> NativeMatrixDescriptor {
        try await request("matrix/chats/\(chatID.uuidString)")
    }

    func bind(chatID: UUID, roomID: String, epoch: Int) async throws -> NativeMatrixDescriptor {
        let data = try JSONSerialization.data(withJSONObject: ["roomID": roomID, "epoch": epoch])
        return try await request("matrix/chats/\(chatID.uuidString)", body: data)
    }

    func createGroup(title: String, contacts: [String]) async throws -> ServerChat {
        let body = try JSONSerialization.data(withJSONObject: ["title": title, "participantContacts": contacts])
        return try await request("chats", body: body)
    }

    func chats() async throws -> [ServerChat] { try await request("chats") }

    private func request<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        guard let credential = await token() else { throw AppError.unauthorized }
        var request = URLRequest(url: baseURL.appendingAPIPath(path))
        request.timeoutInterval = 20
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
        let result: T = try await APIResponseParser.requestJSON(request, using: session, decoder: .mobileMessengerISO8601())
        // The provider is scoped to one Nest session, including after token refresh.
        guard await token() != nil else { throw MatrixWorkspaceError.sessionClosed }
        return result
    }
}
