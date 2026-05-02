import Foundation

public protocol LocationRepository: Sendable {
    func fetchMyLocation() async throws -> MyLocationShare
    func fetchContactLocations() async throws -> [SharedLocation]
    func updateMyLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        sharingEnabled: Bool
    ) async throws -> MyLocationShare
    func stopSharing() async throws
}
