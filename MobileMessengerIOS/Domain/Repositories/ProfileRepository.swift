import Foundation

public protocol ProfileRepository: Sendable {
    func fetchProfile() async throws -> UserProfileDTO
    func updateProfile(displayName: String) async throws -> UserProfileDTO
}
