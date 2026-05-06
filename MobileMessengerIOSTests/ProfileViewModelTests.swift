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
            profile: UserProfileDTOStub(
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Анна Demo",
                phone: "+15551230011"
            )
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

    func testLogoutInvokesSessionAction() async {
        var logoutCalls = 0
        let viewModel = makeViewModel(logoutAction: {
            logoutCalls += 1
        })

        viewModel.logout()
        await Task.yield()

        XCTAssertEqual(logoutCalls, 1)
    }

    func testLogoutDoesNotCrashWithEmptyUserState() async {
        let viewModel = makeViewModel()
        viewModel.update(
            sessionState: .unauthenticated,
            realtimeState: .disconnected,
            environment: .unknown
        )

        viewModel.logout()
        await Task.yield()

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

    func testDisplayNameValidationRejectsInvalidValues() {
        XCTAssertEqual(ProfileViewModel.displayNameValidationMessage(for: " "), "Введите имя пользователя.")
        XCTAssertEqual(ProfileViewModel.displayNameValidationMessage(for: "A"), "Имя должно быть не короче 2 символов.")
        XCTAssertEqual(
            ProfileViewModel.displayNameValidationMessage(for: String(repeating: "a", count: 41)),
            "Имя должно быть не длиннее 40 символов."
        )
    }

    func testSaveDisplayNameUpdatesSessionAndViewModel() async {
        var updatedDisplayName: String?
        let profileService = ProfileServiceStub(
            profile: UserProfileDTOStub(
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Анна Demo",
                phone: "+15551230011"
            ),
            updateResult: UserProfileDTOStub(
                userID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
                displayName: "Новое имя",
                phone: "+15551230011"
            )
        )
        let viewModel = ProfileViewModel(
            fetchProfile: FetchProfileUseCase(
                repository: DefaultProfileRepository(service: profileService)
            ),
            updateProfile: UpdateProfileUseCase(
                repository: DefaultProfileRepository(service: profileService)
            ),
            updateDisplayNameAction: { updatedDisplayName = $0 },
            logoutAction: {}
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
        viewModel.startEditingDisplayName()
        viewModel.editedDisplayName = "Новое имя"

        await viewModel.saveDisplayName()

        XCTAssertEqual(viewModel.displayName, "Новое имя")
        XCTAssertEqual(updatedDisplayName, "Новое имя")
        XCTAssertEqual(viewModel.inlineMessage, "Имя обновлено.")
        XCTAssertFalse(viewModel.isEditingDisplayName)
    }

    func testSaveDisplayNameValidationFailureDoesNotCallBackend() async {
        let profileService = ProfileServiceStub()
        let viewModel = ProfileViewModel(
            fetchProfile: FetchProfileUseCase(
                repository: DefaultProfileRepository(service: profileService)
            ),
            updateProfile: UpdateProfileUseCase(
                repository: DefaultProfileRepository(service: profileService)
            ),
            updateDisplayNameAction: { _ in },
            logoutAction: {}
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
        viewModel.startEditingDisplayName()
        viewModel.editedDisplayName = " "

        await viewModel.saveDisplayName()

        XCTAssertEqual(viewModel.inlineMessage, "Введите имя пользователя.")
        let updateCalls = await profileService.updateCalls
        XCTAssertEqual(updateCalls, 0)
    }

    private func makeViewModel(
        profile: UserProfileDTOStub = UserProfileDTOStub(),
        logoutAction: @escaping @MainActor () async -> Void = {}
    ) -> ProfileViewModel {
        let service = ProfileServiceStub(profile: profile)
        return ProfileViewModel(
            fetchProfile: FetchProfileUseCase(
                repository: DefaultProfileRepository(service: service)
            ),
            updateProfile: UpdateProfileUseCase(
                repository: DefaultProfileRepository(service: service)
            ),
            updateDisplayNameAction: { _ in },
            logoutAction: logoutAction
        )
    }
}

private struct UserProfileDTOStub {
    var userID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!
    var displayName = "Анна Demo"
    var phone = "+15551230011"
}

private actor ProfileServiceStub: ProfileNetworking {
    var profile: UserProfileDTOStub
    var updateResult: UserProfileDTOStub?
    private(set) var updateCalls = 0

    init(
        profile: UserProfileDTOStub = UserProfileDTOStub(),
        updateResult: UserProfileDTOStub? = nil
    ) {
        self.profile = profile
        self.updateResult = updateResult
    }

    func fetchProfile() async throws -> UserProfileDTO {
        try decode(profile)
    }

    func updateProfile(displayName: String) async throws -> UserProfileDTO {
        updateCalls += 1
        if var updateResult {
            updateResult.displayName = displayName
            self.profile = updateResult
            return try decode(updateResult)
        }

        var updated = profile
        updated.displayName = displayName
        profile = updated
        return try decode(updated)
    }

    private func decode(_ stub: UserProfileDTOStub) throws -> UserProfileDTO {
        let payload: [String: String] = [
            "userID": stub.userID.uuidString,
            "displayName": stub.displayName,
            "phone": stub.phone,
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(UserProfileDTO.self, from: data)
    }
}
