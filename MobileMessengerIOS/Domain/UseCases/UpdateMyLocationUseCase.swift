import Foundation

public struct UpdateMyLocationUseCase {
    private let repository: LocationRepository

    public init(repository: LocationRepository) {
        self.repository = repository
    }

    public func callAsFunction(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        sharingEnabled: Bool
    ) async throws -> MyLocationShare {
        try await repository.updateMyLocation(
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            sharingEnabled: sharingEnabled
        )
    }
}
