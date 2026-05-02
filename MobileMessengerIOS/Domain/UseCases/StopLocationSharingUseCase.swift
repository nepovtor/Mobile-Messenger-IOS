import Foundation

public struct StopLocationSharingUseCase {
    private let repository: LocationRepository

    public init(repository: LocationRepository) {
        self.repository = repository
    }

    public func callAsFunction() async throws {
        try await repository.stopSharing()
    }
}
