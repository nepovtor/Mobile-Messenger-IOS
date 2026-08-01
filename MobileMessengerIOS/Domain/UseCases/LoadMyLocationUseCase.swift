import Foundation

public struct LoadMyLocationUseCase {
    private let repository: LocationRepository

    public init(repository: LocationRepository) {
        self.repository = repository
    }

    public func callAsFunction() async throws -> MyLocationShare {
        try await repository.fetchMyLocation()
    }
}

public struct LoadLocationSharingPermissionsUseCase {
    private let repository: LocationRepository

    public init(repository: LocationRepository) {
        self.repository = repository
    }

    public func callAsFunction() async throws -> [LocationSharePermission] {
        try await repository.fetchSharingPermissions()
    }
}
