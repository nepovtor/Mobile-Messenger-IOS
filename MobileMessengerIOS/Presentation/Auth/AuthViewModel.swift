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

@MainActor
public final class AuthViewModel: ObservableObject {
    @Published public var screenMode: AuthScreenMode = .signIn
    @Published public var credentialMode: AuthCredentialMode = .code
    @Published public var method: AuthMethod = .phone
    @Published public var contact: String = ""
    @Published public var password: String = ""
    @Published public var code: String = ""
    @Published public var isSigningInWithPassword: Bool = false
    @Published public var isRequestingCode: Bool = false
    @Published public var isVerifyingCode: Bool = false
    @Published public var errorMessage: String?
    @Published public var isCodeSent: Bool = false
    @Published public var codeExpirationSeconds: Int?
    public let telegramBotURL: URL?

    private let authService: AuthNetworking
    let sessionStore: SessionStore
    public let demoAccounts: [AuthDemoAccount] = [
        AuthDemoAccount(displayName: "Анна Demo", contact: "+15551230011", password: "demo1111"),
        AuthDemoAccount(displayName: "Борис Demo", contact: "+15551230012", password: "demo2222"),
        AuthDemoAccount(displayName: "Вера Demo", contact: "+15551230013", password: "demo3333"),
        AuthDemoAccount(displayName: "Глеб Demo", contact: "+15551230014", password: "demo4444"),
        AuthDemoAccount(displayName: "Даша Demo", contact: "+15551230015", password: "demo5555")
    ]

    public init(
        authService: AuthNetworking,
        sessionStore: SessionStore,
        telegramBotURL: URL? = nil
    ) {
        self.authService = authService
        self.sessionStore = sessionStore
        self.telegramBotURL = telegramBotURL
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

    public func requestCode() async {
        guard !isRequestingCode else { return }
        errorMessage = nil
        codeExpirationSeconds = nil
        isRequestingCode = true
        defer { isRequestingCode = false }

        let sanitizedContact = sanitize(contact: contact)

        do {
            let response = try await authService.requestCode(method: method, contact: sanitizedContact)
            isCodeSent = true
            codeExpirationSeconds = response.expiresIn
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
        }
    }

    public func verifyCode() async {
        guard !isVerifyingCode else { return }
        errorMessage = nil
        isVerifyingCode = true
        defer { isVerifyingCode = false }

        let sanitizedContact = sanitize(contact: contact)
        let sanitizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let response = try await authService.verifyCode(method: method, contact: sanitizedContact, code: sanitizedCode)
            sessionStore.authenticate(with: response.token, userID: response.userID, displayName: response.displayName)
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

        do {
            let response = try await authService.signIn(
                method: method,
                contact: sanitizedContact,
                password: sanitizedPassword
            )
            sessionStore.authenticate(with: response.token, userID: response.userID, displayName: response.displayName)
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
        selectDemoAccount(account)
        await signInWithPassword()
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
        "Код подтверждения приходит в Telegram. Перед входом откройте нашего Telegram-бота и нажмите /start."
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

    private func clearTransientState(keepContact: Bool) {
        if !keepContact {
            contact = ""
        }
        code = ""
        errorMessage = nil
        isCodeSent = false
        isSigningInWithPassword = false
        isRequestingCode = false
        isVerifyingCode = false
        codeExpirationSeconds = nil
    }
}
