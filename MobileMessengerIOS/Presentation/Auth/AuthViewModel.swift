import Foundation

struct DemoAccountCredentials: Identifiable, Hashable {
    let displayName: String
    let phone: String
    let password: String

    var id: String { phone }
}

@MainActor
public final class AuthViewModel: ObservableObject {
    public enum AuthState: Equatable {
        case unauthenticated
        case authenticated
    }

    @Published var method: AuthMethod = .phone
    @Published var displayName: String = ""
    @Published var contact: String = ""
    @Published var password: String = ""
    @Published var code: String = ""
    @Published var isRequestingCode: Bool = false
    @Published var isVerifyingCode: Bool = false
    @Published var errorMessage: String?
    @Published var isCodeSent: Bool = false
    @Published var codeExpirationSeconds: Int?
    @Published var state: AuthState = .unauthenticated

    private let authService: AuthNetworking
    let sessionStore: SessionStore

    static let demoAccounts: [DemoAccountCredentials] = [
        DemoAccountCredentials(displayName: "Анна Demo", phone: "+15551230011", password: "demo1111"),
        DemoAccountCredentials(displayName: "Борис Demo", phone: "+15551230012", password: "demo2222"),
        DemoAccountCredentials(displayName: "Вера Demo", phone: "+15551230013", password: "demo3333"),
        DemoAccountCredentials(displayName: "Глеб Demo", phone: "+15551230014", password: "demo4444"),
        DemoAccountCredentials(displayName: "Даша Demo", phone: "+15551230015", password: "demo5555")
    ]

    init(authService: AuthNetworking, sessionStore: SessionStore) {
        self.authService = authService
        self.sessionStore = sessionStore
        // Check if already authenticated
        if sessionStore.authToken != nil {
            state = .authenticated
        }
    }

    var isContactValid: Bool {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        switch method {
        case .phone:
            let digits = trimmed.filter { $0.isNumber }
            return digits.count >= 10
        case .email:
            return trimmed.contains("@") && trimmed.contains(".")
        }
    }

    var isDisplayNameValid: Bool {
        displayName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .count >= 2
    }

    var isCodeValid: Bool {
        code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4
    }

    var isPasswordValid: Bool {
        password.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4
    }

    func requestCode() async {
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

    func verifyCode(displayName: String? = nil) async {
        guard !isVerifyingCode else { return }
        errorMessage = nil
        isVerifyingCode = true
        defer { isVerifyingCode = false }

        let sanitizedContact = sanitize(contact: contact)
        let sanitizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        let sanitizedDisplayName = sanitize(displayName: displayName)

        do {
            let response = try await authService.verifyCode(
                method: method,
                contact: sanitizedContact,
                code: sanitizedCode,
                displayName: sanitizedDisplayName
            )
            sessionStore.authenticate(
                token: response.token,
                userID: response.userID,
                displayName: response.displayName
            )
            state = .authenticated
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func signInWithPassword() async {
        guard !isVerifyingCode else { return }
        errorMessage = nil
        isVerifyingCode = true
        defer { isVerifyingCode = false }

        let sanitizedContact = sanitize(contact: contact)
        let sanitizedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let response = try await authService.signInWithPassword(
                method: method,
                contact: sanitizedContact,
                password: sanitizedPassword
            )
            sessionStore.authenticate(
                token: response.token,
                userID: response.userID,
                displayName: response.displayName
            )
            state = .authenticated
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func reset() {
        displayName = ""
        contact = ""
        password = ""
        resetVerificationState()
    }

    func resetVerificationState() {
        code = ""
        errorMessage = nil
        isCodeSent = false
        isRequestingCode = false
        isVerifyingCode = false
        codeExpirationSeconds = nil
    }

    func applyDemoAccount(_ account: DemoAccountCredentials) {
        method = .phone
        contact = account.phone
        password = account.password
        errorMessage = nil
        resetVerificationState()
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

    private func sanitize(displayName: String?) -> String? {
        guard let displayName else { return nil }
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
