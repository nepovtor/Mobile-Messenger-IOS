import Foundation
import CoreLocation

struct CurrentLocationFix: Sendable {
    let latitude: Double
    let longitude: Double
    let accuracy: Double?
}

enum LocationPermissionError: LocalizedError, Sendable {
    case disabled
    case denied
    case restricted
    case unavailable

    var errorDescription: String? {
        switch self {
        case .disabled:
            return "Службы геолокации отключены на устройстве."
        case .denied:
            return "Доступ к геолокации запрещён. Разрешите его в настройках iPhone."
        case .restricted:
            return "Геолокация ограничена настройками устройства."
        case .unavailable:
            return "Не удалось определить местоположение. Попробуйте ещё раз."
        }
    }
}

@MainActor
final class LocationPermissionManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorizationStatus: CLAuthorizationStatus

    private let manager: CLLocationManager
    private var authorizationContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?
    private var locationContinuation: CheckedContinuation<CurrentLocationFix, Error>?

    override init() {
        let manager = CLLocationManager()
        self.manager = manager
        self.authorizationStatus = manager.authorizationStatus
        super.init()
        self.manager.delegate = self
        self.manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func requestCurrentLocation() async throws -> CurrentLocationFix {
        guard CLLocationManager.locationServicesEnabled() else {
            throw LocationPermissionError.disabled
        }

        let status = await resolveAuthorizationStatus()
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            return try await withCheckedThrowingContinuation { continuation in
                locationContinuation = continuation
                manager.requestLocation()
            }
        case .restricted:
            throw LocationPermissionError.restricted
        case .denied:
            throw LocationPermissionError.denied
        case .notDetermined:
            throw LocationPermissionError.unavailable
        @unknown default:
            throw LocationPermissionError.unavailable
        }
    }

    func stopTracking() {
        manager.stopUpdatingLocation()
    }

    func authorizationMessage() -> String? {
        switch authorizationStatus {
        case .denied:
            return "Разрешите геолокацию для приложения, чтобы делиться своей точкой."
        case .restricted:
            return "Геолокация ограничена настройками устройства."
        default:
            return nil
        }
    }

    private func resolveAuthorizationStatus() async -> CLAuthorizationStatus {
        let currentStatus = manager.authorizationStatus
        authorizationStatus = currentStatus
        guard currentStatus == .notDetermined else {
            return currentStatus
        }

        return await withCheckedContinuation { continuation in
            authorizationContinuation = continuation
            manager.requestWhenInUseAuthorization()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            authorizationStatus = manager.authorizationStatus
            authorizationContinuation?.resume(returning: manager.authorizationStatus)
            authorizationContinuation = nil
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let location = locations.last else {
            Task { @MainActor in
                locationContinuation?.resume(throwing: LocationPermissionError.unavailable)
                locationContinuation = nil
            }
            return
        }

        Task { @MainActor in
            locationContinuation?.resume(
                returning: CurrentLocationFix(
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    accuracy: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil
                )
            )
            locationContinuation = nil
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        Task { @MainActor in
            locationContinuation?.resume(throwing: error)
            locationContinuation = nil
        }
    }
}
