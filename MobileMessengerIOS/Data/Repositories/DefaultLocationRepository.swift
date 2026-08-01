import Foundation

public struct DefaultLocationRepository: LocationRepository {
    private let service: LocationNetworking

    public init(service: LocationNetworking) {
        self.service = service
    }

    public func fetchMyLocation() async throws -> MyLocationShare {
        MyLocationShare(dto: try await service.fetchMyLocation())
    }

    public func fetchSharingPermissions() async throws -> [LocationSharePermission] {
        try await service.fetchSharingPermissions().map(LocationSharePermission.init(dto:))
    }

    public func fetchContactLocations() async throws -> [SharedLocation] {
        try await service.fetchContactLocations().map(SharedLocation.init(dto:))
    }

    public func updateMyLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        sharingEnabled: Bool
    ) async throws -> MyLocationShare {
        MyLocationShare(
            dto: try await service.updateMyLocation(
                latitude: latitude,
                longitude: longitude,
                accuracy: accuracy,
                sharingEnabled: sharingEnabled
            )
        )
    }

    public func stopSharing() async throws {
        try await service.stopSharing()
    }
}
