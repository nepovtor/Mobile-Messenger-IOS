import Foundation

public struct FetchProfileUseCase {
    private let repository: ProfileRepository

    public init(repository: ProfileRepository) {
        self.repository = repository
    }

    public func callAsFunction() async throws -> UserProfileDTO {
        try await repository.fetchProfile()
    }
}
