@testable import MobileMessengerIOS
import CoreLocation
import XCTest

@MainActor
final class MapViewModelTests: XCTestCase {
    func testLocationDTOsDecode() throws {
        let contactData = try XCTUnwrap(
            """
            {
              "userID": "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
              "displayName": "Анна Demo",
              "phone": "+15551230011",
              "latitude": 53.9,
              "longitude": 27.56,
              "accuracy": 25,
              "updatedAt": "2026-05-02T09:00:00.000Z",
              "isOutdated": false
            }
            """.data(using: .utf8)
        )
        let ownData = try XCTUnwrap(
            """
            {
              "sharingEnabled": true,
              "latitude": 53.9,
              "longitude": 27.56,
              "accuracy": 25,
              "updatedAt": "2026-05-02T09:00:00.000Z"
            }
            """.data(using: .utf8)
        )

        let contact = try JSONDecoder().decode(ServerSharedLocation.self, from: contactData)
        let own = try JSONDecoder().decode(ServerMyLocationShare.self, from: ownData)

        XCTAssertEqual(contact.displayName, "Анна Demo")
        XCTAssertEqual(contact.phone, "+15551230011")
        XCTAssertEqual(contact.latitude, 53.9, accuracy: 0.001)
        XCTAssertEqual(contact.longitude, 27.56, accuracy: 0.001)
        XCTAssertFalse(contact.isOutdated)
        XCTAssertTrue(own.sharingEnabled)
        XCTAssertEqual(own.accuracy, 25)
    }

    func testShareCurrentLocationUpdatesState() async throws {
        let locationService = LocationServiceStub()
        locationService.myLocation = ServerMyLocationShare(
            sharingEnabled: false,
            latitude: nil,
            longitude: nil,
            accuracy: nil,
            updatedAt: nil
        )
        locationService.updatedLocationResult = ServerMyLocationShare(
            sharingEnabled: true,
            latitude: 53.9,
            longitude: 27.56,
            accuracy: 25,
            updatedAt: "2026-05-02T09:00:00.000Z"
        )
        locationService.contactLocations = [
            ServerSharedLocationStub.make(
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Анна Demo",
                phone: "+15551230011"
            )
        ]

        let viewModel = makeMapViewModel(locationService: locationService)
        viewModel.handleSessionChange(
            .authenticated(token: "token", userID: UUID(), displayName: "Owner")
        )

        try await viewModel.shareCurrentLocation(
            CurrentLocationFix(latitude: 53.9, longitude: 27.56, accuracy: 25)
        )

        XCTAssertTrue(viewModel.myLocationShare.sharingEnabled)
        XCTAssertEqual(viewModel.contactLocations.count, 1)
        XCTAssertEqual(viewModel.infoMessage, "Ваша геопозиция видна только контактам, пока sharing включён.")
        XCTAssertNil(viewModel.errorMessage)
    }

    func testMapStateClearsOnLogoutAndUserSwitch() async {
        let locationService = LocationServiceStub()
        locationService.myLocation = ServerMyLocationShare(
            sharingEnabled: true,
            latitude: 53.9,
            longitude: 27.56,
            accuracy: 25,
            updatedAt: "2026-05-02T09:00:00.000Z"
        )
        locationService.contactLocations = [
            ServerSharedLocationStub.make(
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Анна Demo",
                phone: "+15551230011"
            )
        ]

        let viewModel = makeMapViewModel(locationService: locationService)
        let userA = UUID()
        let userB = UUID()

        viewModel.handleSessionChange(.authenticated(token: "token-a", userID: userA, displayName: "A"))
        await viewModel.refresh()
        XCTAssertEqual(viewModel.contactLocations.count, 1)
        XCTAssertTrue(viewModel.myLocationShare.sharingEnabled)

        viewModel.handleSessionChange(.unauthenticated)
        XCTAssertTrue(viewModel.contactLocations.isEmpty)
        XCTAssertFalse(viewModel.myLocationShare.sharingEnabled)

        viewModel.handleSessionChange(.authenticated(token: "token-b", userID: userB, displayName: "B"))
        XCTAssertTrue(viewModel.contactLocations.isEmpty)
        XCTAssertFalse(viewModel.myLocationShare.sharingEnabled)
    }

    func testLocationUpdatePolicyRequiresIntervalAndDistance() {
        let policy = LocationUpdatePolicy(minimumInterval: 7, minimumDistance: 15)
        let start = Date(timeIntervalSince1970: 1_000)
        let first = CurrentLocationFix(latitude: 53.9, longitude: 27.56, accuracy: 10)
        let nearby = CurrentLocationFix(latitude: 53.90001, longitude: 27.56, accuracy: 10)
        let moved = CurrentLocationFix(latitude: 53.901, longitude: 27.56, accuracy: 10)

        XCTAssertTrue(policy.shouldSend(first, at: start, lastSentLocation: nil, lastSentAt: nil))
        XCTAssertFalse(policy.shouldSend(moved, at: start.addingTimeInterval(6), lastSentLocation: first, lastSentAt: start))
        XCTAssertFalse(policy.shouldSend(nearby, at: start.addingTimeInterval(8), lastSentLocation: first, lastSentAt: start))
        XCTAssertTrue(policy.shouldSend(moved, at: start.addingTimeInterval(8), lastSentLocation: first, lastSentAt: start))
    }

    func testShareDoesNotStartWithoutActiveServerPermission() async {
        let service = LocationServiceStub()
        let manager = LocationPermissionManagerSpy()
        let viewModel = makeMapViewModel(locationService: service)
        viewModel.handleSessionChange(.authenticated(token: "token", userID: UUID(), displayName: "Owner"))

        await viewModel.shareMyLocation(using: manager)

        XCTAssertEqual(manager.startCallCount, 0)
        XCTAssertEqual(viewModel.trackingStatus, .noActivePermission)
        XCTAssertEqual(service.updateLocationCallCount, 0)
    }

    func testRefreshRestoresTrackingWhenSharingWasAlreadyEnabled() async {
        let service = LocationServiceStub()
        service.myLocation = ServerMyLocationShare(
            sharingEnabled: true,
            latitude: 53.9,
            longitude: 27.56,
            accuracy: 10,
            updatedAt: "2026-08-01T00:00:00.000Z"
        )
        service.sharingPermissions = [makeActivePermission()]
        let manager = LocationPermissionManagerSpy()
        let viewModel = makeMapViewModel(locationService: service)
        viewModel.handleSessionChange(.authenticated(token: "token", userID: UUID(), displayName: "Owner"))

        viewModel.setApplicationActive(true, using: manager)
        await viewModel.refresh()

        XCTAssertEqual(manager.startCallCount, 1)
        XCTAssertEqual(viewModel.trackingStatus, .starting)
    }

    func testContinuousTrackingIsThrottledAndPausesInBackground() async {
        let service = LocationServiceStub()
        service.sharingPermissions = [makeActivePermission()]
        let manager = LocationPermissionManagerSpy()
        var currentDate = Date(timeIntervalSince1970: 1_000)
        let viewModel = makeMapViewModel(
            locationService: service,
            now: { currentDate }
        )
        viewModel.handleSessionChange(.authenticated(token: "token", userID: UUID(), displayName: "Owner"))

        await viewModel.shareMyLocation(using: manager)
        XCTAssertEqual(manager.startCallCount, 1)

        manager.emit(CurrentLocationFix(latitude: 53.9, longitude: 27.56, accuracy: 10))
        await waitUntil {
            service.updateLocationCallCount == 1 &&
                viewModel.trackingStatus == .active(isPrecise: true)
        }
        XCTAssertEqual(viewModel.trackingStatus, .active(isPrecise: true))

        currentDate = currentDate.addingTimeInterval(6)
        manager.emit(CurrentLocationFix(latitude: 53.901, longitude: 27.56, accuracy: 10))
        await Task.yield()
        XCTAssertEqual(service.updateLocationCallCount, 1)

        currentDate = currentDate.addingTimeInterval(2)
        manager.emit(CurrentLocationFix(latitude: 53.901, longitude: 27.56, accuracy: 10))
        await waitUntil { service.updateLocationCallCount == 2 }

        viewModel.setApplicationActive(false, using: manager)
        XCTAssertEqual(manager.stopCallCount, 1)
        XCTAssertEqual(viewModel.trackingStatus, .paused)

        viewModel.setApplicationActive(true, using: manager)
        await waitUntil { manager.startCallCount == 2 }
    }

    func testRevokedPermissionStopsTrackingBeforeNextUpload() async {
        let service = LocationServiceStub()
        service.sharingPermissions = [makeActivePermission()]
        let manager = LocationPermissionManagerSpy()
        var currentDate = Date(timeIntervalSince1970: 1_000)
        let viewModel = makeMapViewModel(locationService: service, now: { currentDate })
        viewModel.handleSessionChange(.authenticated(token: "token", userID: UUID(), displayName: "Owner"))

        await viewModel.shareMyLocation(using: manager)
        manager.emit(CurrentLocationFix(latitude: 53.9, longitude: 27.56, accuracy: 10))
        await waitUntil { viewModel.trackingStatus == .active(isPrecise: true) }
        XCTAssertEqual(service.updateLocationCallCount, 1)

        let active = makeActivePermission()
        service.sharingPermissions = [
            ServerLocationPermission(
                granteeUserID: active.granteeUserID,
                displayName: active.displayName,
                status: .revoked,
                grantedAt: active.grantedAt,
                expiresAt: active.expiresAt,
                revokedAt: "2026-08-01T00:00:00.000Z"
            )
        ]
        currentDate = currentDate.addingTimeInterval(8)
        manager.emit(CurrentLocationFix(latitude: 53.901, longitude: 27.56, accuracy: 10))

        await waitUntil { viewModel.trackingStatus == .noActivePermission }
        XCTAssertEqual(manager.stopCallCount, 1)
        XCTAssertEqual(service.updateLocationCallCount, 1)
    }

    func testPermissionWatchdogStopsTrackingAfterRevokeWithoutMovement() async {
        let service = LocationServiceStub()
        service.sharingPermissions = [makeActivePermission()]
        let manager = LocationPermissionManagerSpy()
        let viewModel = makeMapViewModel(
            locationService: service,
            permissionValidationInterval: 0.01
        )
        viewModel.handleSessionChange(.authenticated(token: "token", userID: UUID(), displayName: "Owner"))

        await viewModel.shareMyLocation(using: manager)
        let active = makeActivePermission()
        service.sharingPermissions = [
            ServerLocationPermission(
                granteeUserID: active.granteeUserID,
                displayName: active.displayName,
                status: .revoked,
                grantedAt: active.grantedAt,
                expiresAt: active.expiresAt,
                revokedAt: "2026-08-01T00:00:00.000Z"
            )
        ]

        try? await Task.sleep(for: .milliseconds(30))
        await waitUntil { viewModel.trackingStatus == .noActivePermission }
        XCTAssertEqual(manager.stopCallCount, 1)
        XCTAssertEqual(service.updateLocationCallCount, 0)
    }

    private func makeMapViewModel(
        locationService: LocationServiceStub,
        permissionValidationInterval: TimeInterval = 7,
        now: @escaping () -> Date = Date.init
    ) -> MapViewModel {
        let repository = DefaultLocationRepository(service: locationService)
        return MapViewModel(
            loadMyLocation: LoadMyLocationUseCase(repository: repository),
            loadSharingPermissions: LoadLocationSharingPermissionsUseCase(repository: repository),
            loadContactLocations: LoadContactLocationsUseCase(repository: repository),
            updateMyLocation: UpdateMyLocationUseCase(repository: repository),
            stopLocationSharing: StopLocationSharingUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: ChatRepositorySpy()),
            analytics: AnalyticsServiceSpy(),
            permissionValidationInterval: permissionValidationInterval,
            now: now
        )
    }

    private func makeActivePermission() -> ServerLocationPermission {
        ServerLocationPermission(
            granteeUserID: UUID(),
            displayName: "Анна Demo",
            status: .active,
            grantedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2099-01-01T00:00:00.000Z",
            revokedAt: nil
        )
    }

    private func waitUntil(
        _ condition: @escaping @MainActor () -> Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        for _ in 0..<100 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("Condition was not met", file: file, line: line)
    }
}

@MainActor
private final class LocationPermissionManagerSpy: LocationPermissionManaging {
    var authorizationStatus: CLAuthorizationStatus = .authorizedWhenInUse
    var accuracyAuthorization: CLAccuracyAuthorization = .fullAccuracy
    private(set) var isTracking = false
    private(set) var startCallCount = 0
    private(set) var stopCallCount = 0

    private var locationHandler: (@MainActor (CurrentLocationFix) -> Void)?
    private var errorHandler: (@MainActor (Error) -> Void)?

    func startTracking(
        onLocation: @escaping @MainActor (CurrentLocationFix) -> Void,
        onError: @escaping @MainActor (Error) -> Void
    ) async throws {
        startCallCount += 1
        isTracking = true
        locationHandler = onLocation
        errorHandler = onError
    }

    func stopTracking() {
        stopCallCount += 1
        isTracking = false
        locationHandler = nil
        errorHandler = nil
    }

    func emit(_ fix: CurrentLocationFix) {
        locationHandler?(fix)
    }
}
