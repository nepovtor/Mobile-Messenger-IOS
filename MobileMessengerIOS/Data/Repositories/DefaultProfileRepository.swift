import Foundation

public struct DefaultProfileRepository: ProfileRepository {
    private let service: ProfileNetworking

    public init(service: ProfileNetworking) {
        self.service = service
    }

    public func fetchProfile() async throws -> UserProfileDTO {
        try await service.fetchProfile()
    }

    public func updateProfile(displayName: String) async throws -> UserProfileDTO {
        try await service.updateProfile(displayName: displayName)
    }
}
