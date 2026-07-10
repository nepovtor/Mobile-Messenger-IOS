@testable import MobileMessengerIOS
import XCTest

@MainActor
final class AuthViewModelTests: XCTestCase {
    func testRequestCodeSanitizesPhoneAndStoresExpiration() async {
        let authService = AuthServiceSpy()
        let sessionStore = makeSessionStore()
        let viewModel = AuthViewModel(authService: authService, sessionStore: sessionStore)
        viewModel.method = .phone
        viewModel.contact = " +1 (555) 123-0011 "

        await viewModel.requestCode()

        let request = await authService.lastRequestCodeInput
        XCTAssertEqual(request?.contact, "+15551230011")
        XCTAssertTrue(viewModel.isCodeSent)
        XCTAssertEqual(viewModel.codeExpirationSeconds, 300)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testTelegramPairingSanitizesPhoneAndReturnsSecureStartURL() async {
        let authService = AuthServiceSpy()
        let sessionStore = makeSessionStore()
        let viewModel = AuthViewModel(
            authService: authService,
            sessionStore: sessionStore,
            telegramBotURL: URL(string: "https://t.me/mobile_demo_bot")
        )
        viewModel.method = .phone
        viewModel.contact = " +375 (29) 123-45-67 "

        let startURL = await viewModel.requestTelegramPairingLink()

        let request = await authService.lastTelegramPairingPhone
        XCTAssertEqual(request, "+375291234567")
        XCTAssertEqual(startURL?.absoluteString, "https://t.me/mobile_demo_bot?start=secure-pair-token")
        XCTAssertEqual(viewModel.telegramPairingExpiresIn, 600)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testVerifyCodeAuthenticatesSession() async {
        let authService = AuthServiceSpy()
        let sessionStore = makeSessionStore()
        let viewModel = AuthViewModel(authService: authService, sessionStore: sessionStore)
        viewModel.contact = "+15551230011"
        viewModel.code = "123456"

        await viewModel.verifyCode()

        let verify = await authService.lastVerifyCodeInput
        XCTAssertEqual(verify?.contact, "+15551230011")
        XCTAssertEqual(verify?.code, "123456")

        guard case let .authenticated(token, userID, displayName) = sessionStore.state else {
            return XCTFail("Expected authenticated state")
        }

        XCTAssertEqual(token, "test-token")
        XCTAssertEqual(userID, UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))
        XCTAssertEqual(displayName, "Анна Demo")
    }

    func testSetScreenModeToSignUpSwitchesToCodeFlowAndClearsPassword() {
        let viewModel = AuthViewModel(authService: AuthServiceSpy(), sessionStore: makeSessionStore())
        viewModel.password = "demo1111"
        viewModel.code = "1234"
        viewModel.errorMessage = "Ошибка"
        viewModel.isCodeSent = true

        viewModel.setScreenMode(.signUp)

        XCTAssertEqual(viewModel.screenMode, .signUp)
        XCTAssertEqual(viewModel.credentialMode, .code)
        XCTAssertEqual(viewModel.password, "")
        XCTAssertEqual(viewModel.code, "")
        XCTAssertFalse(viewModel.isCodeSent)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testSignInDemoAccountAuthenticatesSession() async {
        let authService = AuthServiceSpy()
        let sessionStore = makeSessionStore()
        let viewModel = AuthViewModel(authService: authService, sessionStore: sessionStore)
        let account = viewModel.demoAccounts[1]

        await viewModel.signInDemoAccount(account)

        let signIn = await authService.lastSignInInput
        XCTAssertEqual(signIn?.contact, account.contact)
        XCTAssertEqual(signIn?.password, account.password)

        guard case let .authenticated(token, userID, displayName) = sessionStore.state else {
            return XCTFail("Expected authenticated state")
        }

        XCTAssertEqual(token, "test-token")
        XCTAssertEqual(userID, UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))
        XCTAssertEqual(displayName, "Анна Demo")
    }

    func testLastUsedPhoneRestoresOnNextViewModel() async {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let authService = AuthServiceSpy()
        let sessionStore = SessionStore(
            tokenStore: InMemoryTokenStore(),
            defaults: defaults
        )
        let firstViewModel = AuthViewModel(
            authService: authService,
            sessionStore: sessionStore,
            defaults: defaults
        )
        firstViewModel.contact = " +375 (29) 123-45-67 "

        await firstViewModel.requestCode()

        let restoredViewModel = AuthViewModel(
            authService: AuthServiceSpy(),
            sessionStore: makeSessionStore(),
            defaults: defaults
        )

        XCTAssertEqual(restoredViewModel.contact, "+375291234567")
        XCTAssertEqual(restoredViewModel.lastUsedLogin?.contact, "+375291234567")
        XCTAssertNil(restoredViewModel.lastUsedLogin?.demoAccount)
    }

    func testLastUsedDemoAccountRestoresAndCanSignInAgain() async {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let firstAuthService = AuthServiceSpy()
        let firstViewModel = AuthViewModel(
            authService: firstAuthService,
            sessionStore: makeSessionStore(),
            defaults: defaults
        )
        let account = firstViewModel.demoAccounts[2]

        await firstViewModel.signInDemoAccount(account)

        let restoredAuthService = AuthServiceSpy()
        let restoredViewModel = AuthViewModel(
            authService: restoredAuthService,
            sessionStore: makeSessionStore(),
            defaults: defaults
        )

        XCTAssertEqual(restoredViewModel.contact, account.contact)
        XCTAssertEqual(restoredViewModel.password, account.password)
        XCTAssertEqual(restoredViewModel.lastUsedLogin?.demoAccount?.contact, account.contact)

        await restoredViewModel.signInLastUsedDemoAccount()

        let signIn = await restoredAuthService.lastSignInInput
        XCTAssertEqual(signIn?.contact, account.contact)
        XCTAssertEqual(signIn?.password, account.password)
    }

}

