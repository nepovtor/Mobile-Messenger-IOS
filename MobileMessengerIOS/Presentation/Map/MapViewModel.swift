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
    @Published var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 53.9, longitude: 27.56),
        span: MKCoordinateSpan(latitudeDelta: 0.2, longitudeDelta: 0.2)
    )
    @Published var selectedMarker: MapMarkerItem?

    private let loadMyLocation: LoadMyLocationUseCase
    private let loadContactLocations: LoadContactLocationsUseCase
    private let updateMyLocation: UpdateMyLocationUseCase
    private let stopLocationSharing: StopLocationSharingUseCase
    private let createChatUseCase: CreateChatUseCase
    private let analytics: AnalyticsService
    private var hasLoaded = false
    private var currentUserID: UUID?

    init(
        loadMyLocation: LoadMyLocationUseCase,
        loadContactLocations: LoadContactLocationsUseCase,
        updateMyLocation: UpdateMyLocationUseCase,
        stopLocationSharing: StopLocationSharingUseCase,
        createChat: CreateChatUseCase,
        analytics: AnalyticsService
    ) {
        self.loadMyLocation = loadMyLocation
        self.loadContactLocations = loadContactLocations
        self.updateMyLocation = updateMyLocation
        self.stopLocationSharing = stopLocationSharing
        self.createChatUseCase = createChat
        self.analytics = analytics
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
        "Location not shared. Здесь появятся только контакты, которые явно включили sharing."
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

    func onAppear() {
        guard !hasLoaded else { return }
        hasLoaded = true
        Task { await refresh() }
    }

    func refresh() async {
        guard currentUserID != nil else { return }
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            async let myLocationTask = loadMyLocation()
            async let contactsTask = loadContactLocations()
            myLocationShare = try await myLocationTask
            contactLocations = try await contactsTask
            errorMessage = nil
            syncRegion()
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_refresh")
        }
    }

    func shareMyLocation(using permissionManager: LocationPermissionManager) async {
        guard !isSharing else { return }

        isSharing = true
        defer { isSharing = false }

        do {
            let fix = try await permissionManager.requestCurrentLocation()
            try await shareCurrentLocation(fix)
        } catch {
            infoMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "map_share_location")
        }
    }

    func stopSharing(using permissionManager: LocationPermissionManager) async {
        guard !isStoppingShare else { return }

        isStoppingShare = true
        defer { isStoppingShare = false }

        do {
            try await stopLocationSharing()
            permissionManager.stopTracking()
            myLocationShare = .disabled
            infoMessage = "Location sharing stopped."
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
            return ChatListItem(
                id: chat.id,
                title: chat.title,
                lastMessagePreview: chat.lastMessagePreview,
                updatedAt: chat.lastActivity,
                unreadCount: chat.unreadCount,
                typingParticipants: chat.typingParticipants,
                participantNames: chat.participantNames,
                participantCount: chat.participantCount
            )
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
    }

    private func resetState() {
        myLocationShare = .disabled
        contactLocations = []
        isLoading = false
        isSharing = false
        isStoppingShare = false
        openingChatPhone = nil
        errorMessage = nil
        infoMessage = nil
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
