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
    public let code: String

    public init(displayName: String, contact: String, code: String) {
        self.id = contact
        self.displayName = displayName
        self.contact = contact
        self.code = code
    }
}

@MainActor
public final class AuthViewModel: ObservableObject {
    @Published public var screenMode: AuthScreenMode = .signIn
    @Published public var credentialMode: AuthCredentialMode = .password
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

    private let authService: AuthNetworking
    let sessionStore: SessionStore
    public let demoAccounts: [AuthDemoAccount] = [
        AuthDemoAccount(displayName: "Alex Carter", contact: "+10000000001", code: "111111"),
        AuthDemoAccount(displayName: "Maria Stone", contact: "+10000000002", code: "222222"),
        AuthDemoAccount(displayName: "Daniel Reed", contact: "+10000000003", code: "333333"),
        AuthDemoAccount(displayName: "Emily Brooks", contact: "+10000000004", code: "444444")
    ]

    public init(authService: AuthNetworking, sessionStore: SessionStore) {
        self.authService = authService
        self.sessionStore = sessionStore
    }

    public var isContactValid: Bool {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        switch method {
        case .phone:
            let digits = trimmed.filter { $0.isNumber }
            return digits.count >= 10
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

    public var isPasswordFlow: Bool {
        screenMode == .signIn && credentialMode == .password
    }

    public var isCodeFlow: Bool {
        !isPasswordFlow
    }

    public func setScreenMode(_ mode: AuthScreenMode) {
        guard screenMode != mode else { return }
        screenMode = mode
        if mode == .signUp {
            credentialMode = .code
        } else {
            credentialMode = .password
        }
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
            codeExpirationSeconds = response?.expiresIn
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
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
            sessionStore.authenticate(with: response.token, userID: response.userID, displayName: response.displayName, phone: response.phone)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
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
            sessionStore.authenticate(with: response.token, userID: response.userID, displayName: response.displayName, phone: response.phone)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func selectDemoAccount(_ account: AuthDemoAccount) {
        method = .phone
        screenMode = .signIn
        credentialMode = .password
        contact = account.contact
        password = account.code
        code = account.code
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

    private func sanitize(contact: String) -> String {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        switch method {
        case .phone:
            let allowed = CharacterSet(charactersIn: "+0123456789")
            return trimmed.unicodeScalars.filter { allowed.contains($0) }.map(String.init).joined()
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
