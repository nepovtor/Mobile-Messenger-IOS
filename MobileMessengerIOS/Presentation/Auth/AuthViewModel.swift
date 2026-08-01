import Foundation

public enum AuthScreenMode: String, CaseIterable, Sendable {
    case signIn
    case signUp

    public var title: String {
        switch self {
        case .signIn:
            return "Sign In"
        case .signUp:
            return "Sign Up"
        }
    }
}

public enum AuthCredentialMode: String, CaseIterable, Sendable {
    case password
    case code

    public var title: String {
        rawValue.capitalized
    }
}

public struct AuthDemoAccount: Identifiable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let contact: String
    public let password: String

    public init(displayName: String, contact: String, password: String) {
        self.id = contact
        self.displayName = displayName
        self.contact = contact
        self.password = password
    }
}

public struct AuthLastUsedLogin: Equatable, Sendable {
    public let contact: String
    public let demoAccount: AuthDemoAccount?

    public var title: String {
        demoAccount?.displayName ?? "Последний номер"
    }

    public var subtitle: String {
        if let demoAccount {
            return "\(demoAccount.contact) · Demo account"
        }

        return contact
    }
}

@MainActor
public final class AuthViewModel: ObservableObject {
    enum DefaultsKeys {
        static let lastUsedContact = "auth.last_used_contact"
        static let lastUsedDemoContact = "auth.last_used_demo_contact"
    }

    @Published public var screenMode: AuthScreenMode = .signIn
    @Published public var credentialMode: AuthCredentialMode = .code
    @Published public var method: AuthMethod = .phone
    @Published public var contact: String = ""
    @Published public var password: String = ""
    @Published public var code: String = ""
    @Published public var isSigningInWithPassword: Bool = false
    @Published public var isLinkingTelegram: Bool = false
    @Published public var isRequestingCode: Bool = false
    @Published public var isVerifyingCode: Bool = false
    @Published public var errorMessage: String?
    @Published public var isCodeSent: Bool = false
    @Published public var codeExpirationSeconds: Int?
    @Published public var telegramPairingExpiresIn: Int?
    @Published public private(set) var lastUsedLogin: AuthLastUsedLogin?
    public let telegramBotURL: URL?
    public let demoAccounts: [AuthDemoAccount]

    private let authService: AuthNetworking
    let sessionStore: SessionStore
    private let defaults: UserDefaults

    public init(
        authService: AuthNetworking,
        sessionStore: SessionStore,
        telegramBotURL: URL? = nil,
        defaults: UserDefaults = .standard
    ) {
        self.authService = authService
        self.sessionStore = sessionStore
        self.telegramBotURL = telegramBotURL
        self.defaults = defaults
        self.demoAccounts = Self.makeDemoAccounts()
        restoreLastUsedLogin()
    }

    public var isContactValid: Bool {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        switch method {
        case .phone:
            let sanitized = sanitize(contact: trimmed)
            let digits = sanitized.filter { $0.isNumber }
            return sanitized.hasPrefix("+") && digits.count >= 8 && digits.count <= 15
        case .email:
            return trimmed.contains("@") && trimmed.contains(".")
        }
    }

    public var isCodeValid: Bool {
        code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4
    }

    public var isPasswordValid: Bool {
        password.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4
    }

    public var selectedDemoAccount: AuthDemoAccount? {
        demoAccounts.first { $0.contact == contact }
    }

    public var isDemoAuthAvailable: Bool {
        !demoAccounts.isEmpty
    }

    public func setScreenMode(_ mode: AuthScreenMode) {
        guard screenMode != mode else { return }
        screenMode = mode
        credentialMode = .code
        clearTransientState(keepContact: true)
        if mode == .signUp {
            password = ""
        }
    }

    public func setCredentialMode(_ mode: AuthCredentialMode) {
        guard screenMode == .signIn, credentialMode != mode else { return }
        credentialMode = mode
        clearTransientState(keepContact: true)
    }

    public func updateContact(_ value: String) {
        guard contact != value else { return }
        contact = value
        clearTransientState(keepContact: true)
    }

    public func requestCode() async {
        guard !isRequestingCode else { return }
        errorMessage = nil
        codeExpirationSeconds = nil
        isRequestingCode = true
        defer { isRequestingCode = false }

        let sanitizedContact = sanitize(contact: contact)
        rememberLastUsedLogin(contact: sanitizedContact)

        do {
            let response = try await authService.requestCode(method: method, contact: sanitizedContact)
            code = ""
            isCodeSent = true
            codeExpirationSeconds = response.expiresIn
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
        }
    }

    public func requestTelegramPairingLink() async -> URL? {
        guard !isLinkingTelegram else { return nil }
        errorMessage = nil
        telegramPairingExpiresIn = nil
        isLinkingTelegram = true
        defer { isLinkingTelegram = false }

        let sanitizedContact = sanitize(contact: contact)
        rememberLastUsedLogin(contact: sanitizedContact)

        do {
            let response = try await authService.requestTelegramPairing(phone: sanitizedContact)
            isCodeSent = false
            code = ""
            codeExpirationSeconds = nil
            telegramPairingExpiresIn = response.expiresIn
            return response.startURL
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
            return nil
        }
    }

    public func verifyCode() async {
        guard !isVerifyingCode else { return }
        errorMessage = nil
        isVerifyingCode = true
        defer { isVerifyingCode = false }

        let sanitizedContact = sanitize(contact: contact)
        let sanitizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        rememberLastUsedLogin(contact: sanitizedContact)

        do {
            let response = try await authService.verifyCode(method: method, contact: sanitizedContact, code: sanitizedCode)
            sessionStore.authenticate(
                with: response.token,
                refreshToken: response.refreshToken,
                userID: response.userID,
                displayName: response.displayName
            )
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
        }
    }

    public func signInWithPassword() async {
        guard !isSigningInWithPassword else { return }
        errorMessage = nil
        isSigningInWithPassword = true
        defer { isSigningInWithPassword = false }

        let sanitizedContact = sanitize(contact: contact)
        let sanitizedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        rememberLastUsedLogin(contact: sanitizedContact)

        do {
            let response = try await authService.signIn(
                method: method,
                contact: sanitizedContact,
                password: sanitizedPassword
            )
            sessionStore.authenticate(
                with: response.token,
                refreshToken: response.refreshToken,
                userID: response.userID,
                displayName: response.displayName
            )
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
        }
    }

    public func selectDemoAccount(_ account: AuthDemoAccount) {
        method = .phone
        screenMode = .signIn
        credentialMode = .code
        contact = account.contact
        password = account.password
        clearTransientState(keepContact: true)
    }

    public func signInDemoAccount(_ account: AuthDemoAccount) async {
        rememberLastUsedLogin(account: account)
        selectDemoAccount(account)
        await signInWithPassword()
    }

    public func applyLastUsedLogin() {
        guard let lastUsedLogin else { return }

        method = .phone
        screenMode = .signIn
        credentialMode = .code
        contact = lastUsedLogin.contact
        password = lastUsedLogin.demoAccount?.password ?? ""
        clearTransientState(keepContact: true)
    }

    public func signInLastUsedDemoAccount() async {
        guard let account = lastUsedLogin?.demoAccount else { return }
        await signInDemoAccount(account)
    }

    public func reset() {
        screenMode = .signIn
        credentialMode = .password
        method = .phone
        contact = ""
        password = ""
        code = ""
        clearTransientState(keepContact: true)
    }

    public var telegramInstructionText: String {
        "Сначала нажмите «Привязать Telegram». Бот откроется по временной защищённой ссылке, после чего отправьте ему свой собственный контакт кнопкой Telegram."
    }

    public var telegramPairingHintText: String? {
        guard let telegramPairingExpiresIn else { return nil }
        return "После отправки контакта вернитесь в приложение и нажмите «Получить код». Ссылка активна \(telegramPairingExpiresIn) секунд."
    }

    private func sanitize(contact: String) -> String {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        switch method {
        case .phone:
            let allowed = CharacterSet(charactersIn: "+0123456789")
            return trimmed
                .unicodeScalars
                .filter { allowed.contains($0) }
                .map(String.init)
                .joined()
        case .email:
            return trimmed.lowercased()
        }
    }

    private func rememberLastUsedLogin(contact: String) {
        let trimmedContact = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedContact.isEmpty else { return }

        let matchedDemoAccount = demoAccounts.first { $0.contact == trimmedContact }
        defaults.set(trimmedContact, forKey: DefaultsKeys.lastUsedContact)
        if let matchedDemoAccount {
            defaults.set(matchedDemoAccount.contact, forKey: DefaultsKeys.lastUsedDemoContact)
        } else {
            defaults.removeObject(forKey: DefaultsKeys.lastUsedDemoContact)
        }

        lastUsedLogin = AuthLastUsedLogin(
            contact: trimmedContact,
            demoAccount: matchedDemoAccount
        )
    }

    private func rememberLastUsedLogin(account: AuthDemoAccount) {
        defaults.set(account.contact, forKey: DefaultsKeys.lastUsedContact)
        defaults.set(account.contact, forKey: DefaultsKeys.lastUsedDemoContact)
        lastUsedLogin = AuthLastUsedLogin(contact: account.contact, demoAccount: account)
    }

    private func restoreLastUsedLogin() {
        guard
            let lastUsedContact = defaults.string(forKey: DefaultsKeys.lastUsedContact)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !lastUsedContact.isEmpty
        else {
            return
        }

        let storedDemoContact = defaults.string(forKey: DefaultsKeys.lastUsedDemoContact)
        let matchedDemoAccount = demoAccounts.first { account in
            account.contact == storedDemoContact || account.contact == lastUsedContact
        }

        lastUsedLogin = AuthLastUsedLogin(
            contact: lastUsedContact,
            demoAccount: matchedDemoAccount
        )

        contact = lastUsedContact
        password = matchedDemoAccount?.password ?? ""
    }

    private func clearTransientState(keepContact: Bool) {
        if !keepContact {
            contact = ""
        }
        code = ""
        errorMessage = nil
        isCodeSent = false
        isLinkingTelegram = false
        isSigningInWithPassword = false
        isRequestingCode = false
        isVerifyingCode = false
        codeExpirationSeconds = nil
        telegramPairingExpiresIn = nil
    }

    private static func makeDemoAccounts() -> [AuthDemoAccount] {
        #if DEBUG
        return [
            AuthDemoAccount(displayName: "Анна Demo", contact: "+15551230011", password: "demo1111"),
            AuthDemoAccount(displayName: "Борис Demo", contact: "+15551230012", password: "demo2222"),
            AuthDemoAccount(displayName: "Вера Demo", contact: "+15551230013", password: "demo3333"),
            AuthDemoAccount(displayName: "Глеб Demo", contact: "+15551230014", password: "demo4444"),
            AuthDemoAccount(displayName: "Даша Demo", contact: "+15551230015", password: "demo5555")
        ]
        #else
        []
        #endif
    }
}
