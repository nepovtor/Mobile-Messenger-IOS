import Foundation

public struct UpdateProfileUseCase {
    private let repository: ProfileRepository

    public init(repository: ProfileRepository) {
        self.repository = repository
    }

    public func callAsFunction(displayName: String) async throws -> UserProfileDTO {
        try await repository.updateProfile(displayName: displayName)
    }
}
