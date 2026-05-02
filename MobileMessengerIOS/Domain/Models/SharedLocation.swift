import Foundation
import CoreLocation

public struct SharedLocation: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let userID: UUID
    public let displayName: String
    public let phone: String
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double?
    public let updatedAt: String
    public let isOutdated: Bool

    public init(
        id: UUID,
        userID: UUID,
        displayName: String,
        phone: String,
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        updatedAt: String,
        isOutdated: Bool
    ) {
        self.id = id
        self.userID = userID
        self.displayName = displayName
        self.phone = phone
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.updatedAt = updatedAt
        self.isOutdated = isOutdated
    }

    public var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

public struct MyLocationShare: Hashable, Sendable {
    public let sharingEnabled: Bool
    public let latitude: Double?
    public let longitude: Double?
    public let accuracy: Double?
    public let updatedAt: String?

    public init(
        sharingEnabled: Bool,
        latitude: Double?,
        longitude: Double?,
        accuracy: Double?,
        updatedAt: String?
    ) {
        self.sharingEnabled = sharingEnabled
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.updatedAt = updatedAt
    }

    public var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    public static let disabled = MyLocationShare(
        sharingEnabled: false,
        latitude: nil,
        longitude: nil,
        accuracy: nil,
        updatedAt: nil
    )
}

extension SharedLocation {
    init(dto: ServerSharedLocation) {
        self.init(
            id: dto.userID,
            userID: dto.userID,
            displayName: dto.displayName,
            phone: dto.phone,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            updatedAt: dto.updatedAt,
            isOutdated: dto.isOutdated
        )
    }
}

extension MyLocationShare {
    init(dto: ServerMyLocationShare) {
        self.init(
            sharingEnabled: dto.sharingEnabled,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            updatedAt: dto.updatedAt
        )
    }
}
