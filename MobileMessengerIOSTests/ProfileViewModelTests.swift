import XCTest
@testable import MobileMessengerIOS

@MainActor
final class ProfileViewModelTests: XCTestCase {
    func testProfileViewModelShowsDisplayNameFromCurrentUser() {
        let viewModel = makeViewModel()

        viewModel.update(
            sessionState: .authenticated(
                token: "token",
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Анна Demo"
            ),
            realtimeState: .connected,
            environment: .unknown
        )

        XCTAssertEqual(viewModel.displayName, "Анна Demo")
    }

    func testProfileViewModelShowsPhoneWhenPhoneExists() async {
        let viewModel = makeViewModel(
            contacts: [
                ContactDTO(
                    userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                    displayName: "Анна Demo",
                    contact: "+15551230011",
                    isCurrentUser: true
                )
            ]
        )

        viewModel.update(
            sessionState: .authenticated(
                token: "token",
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Анна Demo"
            ),
            realtimeState: .connected,
            environment: .unknown
        )

        await viewModel.refreshProfile()

        XCTAssertEqual(viewModel.phone, "+15551230011")
    }

    func testLogoutInvokesSessionAction() {
        var logoutCalls = 0
        let viewModel = makeViewModel(logoutAction: {
            logoutCalls += 1
        })

        viewModel.logout()

        XCTAssertEqual(logoutCalls, 1)
    }

    func testLogoutDoesNotCrashWithEmptyUserState() {
        let viewModel = makeViewModel()
        viewModel.update(
            sessionState: .unauthenticated,
            realtimeState: .disconnected,
            environment: .unknown
        )

        viewModel.logout()

        XCTAssertEqual(viewModel.phone, "Unknown phone")
    }

    func testRealtimeStatusMappingWorks() {
        XCTAssertEqual(ProfileRealtimeStatus(state: .connected), .connected)
        XCTAssertEqual(ProfileRealtimeStatus(state: .connecting(retry: 0)), .connecting)
        XCTAssertEqual(ProfileRealtimeStatus(state: .reconnecting(retry: 2)), .reconnecting)
        XCTAssertEqual(ProfileRealtimeStatus(state: .disconnected), .disconnected)
        XCTAssertEqual(ProfileRealtimeStatus(state: .failed(reason: "boom")), .failed)
    }

    func testInitialsUseDisplayNameWords() {
        XCTAssertEqual(ProfileViewModel.makeInitials(from: "Анна Demo"), "АD")
        XCTAssertEqual(ProfileViewModel.makeInitials(from: "Boris"), "BO")
    }

    func testPhoneFallbackReturnsUnknownForInvalidContact() {
        XCTAssertEqual(ProfileViewModel.phoneText(from: nil), "Unknown phone")
        XCTAssertEqual(ProfileViewModel.phoneText(from: "demo"), "Unknown phone")
    }

    private func makeViewModel(
        contacts: [ContactDTO] = [],
        logoutAction: @escaping @MainActor () -> Void = {}
    ) -> ProfileViewModel {
        ProfileViewModel(
            contactsService: ContactsServiceStub(contacts: contacts),
            logoutAction: logoutAction
        )
    }
}

private struct ContactsServiceStub: ContactsNetworking {
    var contacts: [ContactDTO] = []

    func listContacts() async throws -> [ContactDTO] {
        contacts
    }
}
