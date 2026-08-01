import Foundation
import CoreLocation

struct CurrentLocationFix: Sendable, Equatable {
    let latitude: Double
    let longitude: Double
    let accuracy: Double?
    let timestamp: Date
    let isPrecise: Bool

    init(
        latitude: Double,
        longitude: Double,
        accuracy: Double?,
        timestamp: Date = Date(),
        isPrecise: Bool = true
    ) {
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.timestamp = timestamp
        self.isPrecise = isPrecise
    }
}

struct LocationUpdatePolicy: Sendable {
    let minimumInterval: TimeInterval
    let minimumDistance: CLLocationDistance

    init(
        minimumInterval: TimeInterval = 7,
        minimumDistance: CLLocationDistance = 15
    ) {
        self.minimumInterval = minimumInterval
        self.minimumDistance = minimumDistance
    }

    func shouldSend(
        _ candidate: CurrentLocationFix,
        at date: Date,
        lastSentLocation: CurrentLocationFix?,
        lastSentAt: Date?
    ) -> Bool {
        guard (-90 ... 90).contains(candidate.latitude),
              (-180 ... 180).contains(candidate.longitude) else {
            return false
        }
        guard let lastSentLocation, let lastSentAt else {
            return true
        }
        guard date.timeIntervalSince(lastSentAt) >= minimumInterval else {
            return false
        }

        let previous = CLLocation(
            latitude: lastSentLocation.latitude,
            longitude: lastSentLocation.longitude
        )
        let current = CLLocation(
            latitude: candidate.latitude,
            longitude: candidate.longitude
        )
        return current.distance(from: previous) >= minimumDistance
    }
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
protocol LocationPermissionManaging: AnyObject {
    var authorizationStatus: CLAuthorizationStatus { get }
    var accuracyAuthorization: CLAccuracyAuthorization { get }
    var isTracking: Bool { get }

    func startTracking(
        onLocation: @escaping @MainActor (CurrentLocationFix) -> Void,
        onError: @escaping @MainActor (Error) -> Void
    ) async throws
    func stopTracking()
}

@MainActor
final class LocationPermissionManager: NSObject, ObservableObject, LocationPermissionManaging,
    CLLocationManagerDelegate {
    @Published private(set) var authorizationStatus: CLAuthorizationStatus
    @Published private(set) var accuracyAuthorization: CLAccuracyAuthorization
    @Published private(set) var isTracking = false

    private let manager: CLLocationManager
    private var authorizationContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?
    private var locationHandler: (@MainActor (CurrentLocationFix) -> Void)?
    private var errorHandler: (@MainActor (Error) -> Void)?

    override init() {
        let manager = CLLocationManager()
        self.manager = manager
        self.authorizationStatus = manager.authorizationStatus
        self.accuracyAuthorization = manager.accuracyAuthorization
        super.init()
        self.manager.delegate = self
        self.manager.desiredAccuracy = kCLLocationAccuracyBest
        self.manager.distanceFilter = 15
        self.manager.pausesLocationUpdatesAutomatically = true
        self.manager.allowsBackgroundLocationUpdates = false
        self.manager.showsBackgroundLocationIndicator = false
    }

    func startTracking(
        onLocation: @escaping @MainActor (CurrentLocationFix) -> Void,
        onError: @escaping @MainActor (Error) -> Void
    ) async throws {
        guard CLLocationManager.locationServicesEnabled() else {
            throw LocationPermissionError.disabled
        }

        let status = await resolveAuthorizationStatus()
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            locationHandler = onLocation
            errorHandler = onError
            guard !isTracking else { return }
            isTracking = true
            manager.startUpdatingLocation()
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
        isTracking = false
        locationHandler = nil
        errorHandler = nil
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
        accuracyAuthorization = manager.accuracyAuthorization
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
            accuracyAuthorization = manager.accuracyAuthorization
            authorizationContinuation?.resume(returning: manager.authorizationStatus)
            authorizationContinuation = nil

            switch manager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse, .notDetermined:
                break
            case .denied, .restricted:
                let handler = errorHandler
                stopTracking()
                handler?(manager.authorizationStatus == .denied
                    ? LocationPermissionError.denied
                    : LocationPermissionError.restricted)
            @unknown default:
                stopTracking()
            }
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let location = locations.last else { return }

        Task { @MainActor in
            accuracyAuthorization = manager.accuracyAuthorization
            locationHandler?(
                CurrentLocationFix(
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    accuracy: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil,
                    timestamp: location.timestamp,
                    isPrecise: manager.accuracyAuthorization == .fullAccuracy
                )
            )
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        Task { @MainActor in
            if let locationError = error as? CLError, locationError.code == .denied {
                stopTracking()
            }
            errorHandler?(error)
        }
    }
}
