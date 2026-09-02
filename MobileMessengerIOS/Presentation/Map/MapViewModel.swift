import Foundation
import MapKit

struct MapMarkerItem: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let coordinate: CLLocationCoordinate2D
    let phone: String?
    let accuracy: Double?
    let updatedAt: String?
    let isOutdated: Bool
    let isCurrentUser: Bool
}

enum LocationTrackingStatus: Equatable {
    case off
    case starting
    case active(isPrecise: Bool)
    case paused
    case noActivePermission
    case authorizationDenied
    case unavailable

    var title: String {
        switch self {
        case .off:
            return "Передача выключена"
        case .starting:
            return "Запускаем геолокацию…"
        case .active(true):
            return "Геолокация обновляется"
        case .active(false):
            return "Обновляется без точных координат"
        case .paused:
            return "Приостановлено в фоне"
        case .noActivePermission:
            return "Нет активного разрешения контакту"
        case .authorizationDenied:
            return "Нет доступа к геолокации"
        case .unavailable:
            return "Геолокация временно недоступна"
        }
    }
}

@MainActor
final class MapViewModel: ObservableObject {
    @Published private(set) var myLocationShare: MyLocationShare = .disabled
    @Published private(set) var contactLocations: [SharedLocation] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSharing = false
    @Published private(set) var isStoppingShare = false
    @Published private(set) var openingChatPhone: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var infoMessage: String?
    @Published private(set) var trackingStatus: LocationTrackingStatus = .off
    @Published private(set) var lastLocationUpdateAt: Date?
    @Published var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 53.9, longitude: 27.56),
        span: MKCoordinateSpan(latitudeDelta: 0.2, longitudeDelta: 0.2)
    )
    @Published var selectedMarker: MapMarkerItem?

    private let loadMyLocation: LoadMyLocationUseCase
    private let loadSharingPermissions: LoadLocationSharingPermissionsUseCase
    private let loadContactLocations: LoadContactLocationsUseCase
    private let updateMyLocation: UpdateMyLocationUseCase
    private let stopLocationSharing: StopLocationSharingUseCase
    private let createChatUseCase: CreateChatUseCase
    private let analytics: AnalyticsService
    private var hasLoaded = false
    private var currentUserID: UUID?
    private var sharingPermissions: [LocationSharePermission] = []
    private var isApplicationActive = true
    private weak var permissionManager: (any LocationPermissionManaging)?
    private var locationUpdateTask: Task<Void, Never>?
    private var permissionExpiryTask: Task<Void, Never>?
    private var permissionValidationTask: Task<Void, Never>?
    private var lastSentLocation: CurrentLocationFix?
    private var lastSentAt: Date?
    private let updatePolicy: LocationUpdatePolicy
    private let permissionValidationInterval: TimeInterval
    private let now: () -> Date

    init(
        loadMyLocation: LoadMyLocationUseCase,
        loadSharingPermissions: LoadLocationSharingPermissionsUseCase,
        loadContactLocations: LoadContactLocationsUseCase,
        updateMyLocation: UpdateMyLocationUseCase,
        stopLocationSharing: StopLocationSharingUseCase,
        createChat: CreateChatUseCase,
        analytics: AnalyticsService,
        updatePolicy: LocationUpdatePolicy = LocationUpdatePolicy(),
        permissionValidationInterval: TimeInterval = 7,
        now: @escaping () -> Date = Date.init
    ) {
        self.loadMyLocation = loadMyLocation
        self.loadSharingPermissions = loadSharingPermissions
        self.loadContactLocations = loadContactLocations
        self.updateMyLocation = updateMyLocation
        self.stopLocationSharing = stopLocationSharing
        self.createChatUseCase = createChat
        self.analytics = analytics
        self.updatePolicy = updatePolicy
        self.permissionValidationInterval = permissionValidationInterval
        self.now = now
    }

    var markers: [MapMarkerItem] {
        let ownMarker = myLocationShare.coordinate.map {
            MapMarkerItem(
                id: "me",
                title: "Вы",
                subtitle: "Ваше местоположение",
                coordinate: $0,
                phone: nil,
                accuracy: myLocationShare.accuracy,
                updatedAt: myLocationShare.updatedAt,
                isOutdated: Self.isOutdated(myLocationShare.updatedAt),
                isCurrentUser: true
            )
        }

        let contactMarkers = contactLocations.map { location in
            MapMarkerItem(
                id: location.userID.uuidString,
                title: location.displayName,
                subtitle: location.phone,
                coordinate: location.coordinate,
                phone: location.phone,
                accuracy: location.accuracy,
                updatedAt: location.updatedAt,
                isOutdated: location.isOutdated,
                isCurrentUser: false
            )
        }

        return (ownMarker.map { [$0] } ?? []) + contactMarkers
    }

    var emptyStateMessage: String {
        "Здесь появятся только контакты, которые явно включили передачу геолокации."
    }

    func handleSessionChange(_ sessionState: SessionStore.State) {
        switch sessionState {
        case let .authenticated(_, userID, _):
            if currentUserID != userID {
                currentUserID = userID
                resetState()
            }
        case .unauthenticated:
            currentUserID = nil
            resetState()
        }
    }

    func onAppear(
        using permissionManager: any LocationPermissionManaging,
        isApplicationActive: Bool
    ) {
        guard !hasLoaded else { return }
        hasLoaded = true
        self.permissionManager = permissionManager
        self.isApplicationActive = isApplicationActive
        Task { await refresh() }
    }

    func refresh() async {
        guard currentUserID != nil else { return }
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            async let myLocationTask = loadMyLocation()
            async let permissionsTask = loadSharingPermissions()
            async let contactsTask = loadContactLocations()
            myLocationShare = try await myLocationTask
            sharingPermissions = try await permissionsTask
            contactLocations = try await contactsTask
            errorMessage = nil
            syncRegion()
            schedulePermissionExpiryCheck()

            if myLocationShare.sharingEnabled, !hasValidSharingPermission {
                stopLocalTracking(status: .noActivePermission)
            } else if myLocationShare.sharingEnabled,
                      isApplicationActive,
                      let permissionManager,
                      !permissionManager.isTracking {
                trackingStatus = .starting
                do {
                    try await startTracking(using: permissionManager)
                } catch {
                    stopLocalTracking(status: trackingStatus(for: error))
                    errorMessage = AppError.presentableMessage(for: error)
                    analytics.track(error: error, context: "map_restore_location_stream")
                }
            }
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_refresh")
        }
    }

    func shareMyLocation(using permissionManager: any LocationPermissionManaging) async {
        guard !isSharing else { return }

        isSharing = true
        defer { isSharing = false }

        do {
            sharingPermissions = try await loadSharingPermissions()
            guard hasValidSharingPermission else {
                stopLocalTracking(status: .noActivePermission)
                infoMessage = nil
                errorMessage = "Передавать геолокацию можно только контакту с действующим разрешением."
                return
            }

            self.permissionManager = permissionManager
            trackingStatus = .starting
            schedulePermissionExpiryCheck()
            try await startTracking(using: permissionManager)
        } catch {
            stopLocalTracking(status: trackingStatus(for: error))
            infoMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_share_location")
        }
    }

    func stopSharing(using permissionManager: any LocationPermissionManaging) async {
        guard !isStoppingShare else { return }

        isStoppingShare = true
        defer { isStoppingShare = false }

        do {
            try await stopLocationSharing()
            stopLocalTracking(status: .off)
            myLocationShare = .disabled
            infoMessage = "Передача геолокации остановлена."
            errorMessage = nil
            selectedMarker = nil
            contactLocations = try await loadContactLocations()
            syncRegion()
        } catch {
            infoMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_stop_share")
        }
    }

    func setApplicationActive(
        _ isActive: Bool,
        using permissionManager: any LocationPermissionManaging
    ) {
        isApplicationActive = isActive
        self.permissionManager = permissionManager

        guard isActive else {
            permissionManager.stopTracking()
            locationUpdateTask?.cancel()
            locationUpdateTask = nil
            permissionValidationTask?.cancel()
            permissionValidationTask = nil
            if myLocationShare.sharingEnabled {
                trackingStatus = .paused
            }
            return
        }

        guard myLocationShare.sharingEnabled else {
            trackingStatus = .off
            return
        }

        Task { [weak self, weak permissionManager] in
            guard let self, let permissionManager else { return }
            await self.resumeTrackingIfAllowed(using: permissionManager)
        }
    }

    func openChat(for marker: MapMarkerItem) async -> ChatListItem? {
        guard let phone = marker.phone, !marker.isCurrentUser else { return nil }
        guard openingChatPhone == nil else { return nil }

        openingChatPhone = phone
        defer { openingChatPhone = nil }

        do {
            let chat = try await createChatUseCase(
                title: marker.title,
                participantContacts: [phone]
            )
            errorMessage = nil
            return ChatListItem(chat: chat)
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_open_chat")
            return nil
        }
    }

    func shareCurrentLocation(_ fix: CurrentLocationFix) async throws {
        myLocationShare = try await updateMyLocation(
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            sharingEnabled: true
        )
        infoMessage = "Ваша геопозиция видна только контактам, пока sharing включён."
        errorMessage = nil
        selectedMarker = nil
        syncRegion(center: CLLocationCoordinate2D(latitude: fix.latitude, longitude: fix.longitude))
        contactLocations = try await loadContactLocations()
        lastSentLocation = fix
        lastSentAt = now()
        lastLocationUpdateAt = lastSentAt
        trackingStatus = .active(isPrecise: fix.isPrecise)
    }

    private var hasValidSharingPermission: Bool {
        sharingPermissions.contains { $0.isValid(at: now()) }
    }

    private func startTracking(using permissionManager: any LocationPermissionManaging) async throws {
        guard isApplicationActive else {
            trackingStatus = .paused
            return
        }

        try await permissionManager.startTracking(
            onLocation: { [weak self] fix in
                self?.handleLocationFix(fix)
            },
            onError: { [weak self] error in
                self?.handleTrackingError(error)
            }
        )
        startPermissionValidationLoop()
    }

    private func resumeTrackingIfAllowed(
        using permissionManager: any LocationPermissionManaging
    ) async {
        do {
            sharingPermissions = try await loadSharingPermissions()
            guard hasValidSharingPermission else {
                stopLocalTracking(status: .noActivePermission)
                return
            }
            schedulePermissionExpiryCheck()
            trackingStatus = .starting
            try await startTracking(using: permissionManager)
        } catch {
            stopLocalTracking(status: trackingStatus(for: error))
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_resume_location")
        }
    }

    private func handleLocationFix(_ fix: CurrentLocationFix) {
        guard isApplicationActive, hasValidSharingPermission else {
            if !hasValidSharingPermission {
                stopLocalTracking(status: .noActivePermission)
            }
            return
        }
        guard updatePolicy.shouldSend(
            fix,
            at: now(),
            lastSentLocation: lastSentLocation,
            lastSentAt: lastSentAt
        ) else { return }
        guard locationUpdateTask == nil else { return }

        locationUpdateTask = Task { [weak self] in
            guard let self else { return }
            defer { self.locationUpdateTask = nil }

            do {
                self.sharingPermissions = try await self.loadSharingPermissions()
                guard self.hasValidSharingPermission, self.isApplicationActive else {
                    self.stopLocalTracking(status: .noActivePermission)
                    return
                }
                try await self.shareCurrentLocation(fix)
            } catch {
                guard !Task.isCancelled else { return }
                self.errorMessage = AppError.presentableMessage(for: error)
                self.trackingStatus = .unavailable
                self.analytics.track(error: error, context: "map_continuous_location_update")
            }
        }
    }

    private func handleTrackingError(_ error: Error) {
        stopLocalTracking(status: trackingStatus(for: error))
        errorMessage = AppError.presentableMessage(for: error)
        analytics.track(error: error, context: "map_location_stream")
    }

    private func trackingStatus(for error: Error) -> LocationTrackingStatus {
        guard let permissionError = error as? LocationPermissionError else {
            return .unavailable
        }
        switch permissionError {
        case .denied, .restricted:
            return .authorizationDenied
        case .disabled, .unavailable:
            return .unavailable
        }
    }

    private func schedulePermissionExpiryCheck() {
        permissionExpiryTask?.cancel()
        guard let expirationDate = sharingPermissions
            .filter({ $0.isValid(at: now()) })
            .compactMap(\.expirationDate)
            .min() else { return }

        let delay = max(0, expirationDate.timeIntervalSince(now()))
        permissionExpiryTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            guard let self, !self.hasValidSharingPermission else { return }
            self.stopLocalTracking(status: .noActivePermission)
        }
    }

    private func startPermissionValidationLoop() {
        permissionValidationTask?.cancel()
        permissionValidationTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    try await Task.sleep(for: .seconds(self.permissionValidationInterval))
                } catch {
                    return
                }
                guard self.isApplicationActive else { return }

                do {
                    self.sharingPermissions = try await self.loadSharingPermissions()
                    guard self.hasValidSharingPermission else {
                        self.stopLocalTracking(status: .noActivePermission)
                        return
                    }
                    self.schedulePermissionExpiryCheck()
                } catch {
                    guard !Task.isCancelled else { return }
                    self.analytics.track(error: error, context: "map_validate_location_permission")
                }
            }
        }
    }

    private func stopLocalTracking(status: LocationTrackingStatus) {
        permissionManager?.stopTracking()
        locationUpdateTask?.cancel()
        locationUpdateTask = nil
        permissionExpiryTask?.cancel()
        permissionExpiryTask = nil
        permissionValidationTask?.cancel()
        permissionValidationTask = nil
        trackingStatus = status
    }

    private func resetState() {
        stopLocalTracking(status: .off)
        myLocationShare = .disabled
        sharingPermissions = []
        contactLocations = []
        isLoading = false
        isSharing = false
        isStoppingShare = false
        openingChatPhone = nil
        errorMessage = nil
        infoMessage = nil
        lastLocationUpdateAt = nil
        lastSentLocation = nil
        lastSentAt = nil
        selectedMarker = nil
        hasLoaded = false
        region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 53.9, longitude: 27.56),
            span: MKCoordinateSpan(latitudeDelta: 0.2, longitudeDelta: 0.2)
        )
    }

    private func syncRegion(center explicitCenter: CLLocationCoordinate2D? = nil) {
        let center = explicitCenter ?? myLocationShare.coordinate ?? contactLocations.first?.coordinate
        guard let center else { return }

        region = MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
        )
    }

    private static func isOutdated(_ updatedAt: String?) -> Bool {
        guard let updatedAt, let date = ISO8601DateFormatter.flexible.date(from: updatedAt) else {
            return false
        }
        return Date().timeIntervalSince(date) > 600
    }
}

extension ISO8601DateFormatter {
    static let flexible: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
