@testable import MobileMessengerIOS
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

    private func makeMapViewModel(locationService: LocationServiceStub) -> MapViewModel {
        let repository = DefaultLocationRepository(service: locationService)
        return MapViewModel(
            loadMyLocation: LoadMyLocationUseCase(repository: repository),
            loadContactLocations: LoadContactLocationsUseCase(repository: repository),
            updateMyLocation: UpdateMyLocationUseCase(repository: repository),
            stopLocationSharing: StopLocationSharingUseCase(repository: repository),
            createChat: CreateChatUseCase(repository: ChatRepositorySpy()),
            analytics: AnalyticsServiceSpy()
        )
    }
}

