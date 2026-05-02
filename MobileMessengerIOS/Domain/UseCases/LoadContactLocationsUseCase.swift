import Foundation

public struct LoadContactLocationsUseCase {
    private let repository: LocationRepository

    public init(repository: LocationRepository) {
        self.repository = repository
    }

    public func callAsFunction() async throws -> [SharedLocation] {
        try await repository.fetchContactLocations()
    }
}
