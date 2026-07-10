import Foundation

public protocol LocationNetworking: Sendable {
    func fetchMyLocation() async throws -> ServerMyLocationShare
    func updateMyLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        sharingEnabled: Bool
    ) async throws -> ServerMyLocationShare
    func stopSharing() async throws
    func fetchContactLocations() async throws -> [ServerSharedLocation]
}

public struct ServerMyLocationShare: Codable, Sendable {
    public let sharingEnabled: Bool
    public let latitude: Double?
    public let longitude: Double?
    public let accuracy: Double?
    public let updatedAt: String?
}

public struct ServerSharedLocation: Decodable, Identifiable, Hashable, Sendable {
    public var id: UUID { userID }

    public let userID: UUID
    public let displayName: String
    public let phone: String
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double?
    public let updatedAt: String
    public let isOutdated: Bool

    private enum CodingKeys: String, CodingKey {
        case userID
        case userId
        case displayName
        case phone
        case latitude
        case longitude
        case accuracy
        case updatedAt
        case isOutdated
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try container.decode(String.self, forKey: .displayName)
        phone = try container.decode(String.self, forKey: .phone)
        latitude = try container.decode(Double.self, forKey: .latitude)
        longitude = try container.decode(Double.self, forKey: .longitude)
        accuracy = try container.decodeIfPresent(Double.self, forKey: .accuracy)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        isOutdated = try container.decode(Bool.self, forKey: .isOutdated)

        if let decodedUserID = try container.decodeIfPresent(UUID.self, forKey: .userID) ??
            container.decodeIfPresent(UUID.self, forKey: .userId) {
            userID = decodedUserID
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.userID,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Missing userID/userId in location response"
                )
            )
        }
    }
}

public struct RESTLocationService: LocationNetworking {
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

    public func fetchMyLocation() async throws -> ServerMyLocationShare {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.getMyLocation)))
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

    public func updateMyLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        sharingEnabled: Bool
    ) async throws -> ServerMyLocationShare {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.updateMyLocation)))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            UpdateLocationPayload(
                latitude: latitude,
                longitude: longitude,
                accuracy: accuracy,
                sharingEnabled: sharingEnabled
            )
        )
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

    public func stopSharing() async throws {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.stopLocationSharing)))
        request.httpMethod = "DELETE"
        try await authorize(&request)

        do {
            let _: EmptyLocationResponse = try await APIResponseParser.requestJSON(
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

    public func fetchContactLocations() async throws -> [ServerSharedLocation] {
        var request = URLRequest(url: baseURL.appendingAPIPath(GeneratedAPIContract.path(.listContactLocations)))
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

    private func authorize(_ request: inout URLRequest) async throws {
        if let token = await authTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            throw AppError.unauthorized
        }
    }
}

private struct UpdateLocationPayload: Codable {
    let latitude: Double
    let longitude: Double
    let accuracy: Double?
    let sharingEnabled: Bool
}

private struct EmptyLocationResponse: Codable {}
