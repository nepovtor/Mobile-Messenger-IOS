import Foundation

@MainActor
public final class AuthViewModel: ObservableObject {
    public enum AuthState: Equatable {
        case unauthenticated
        case authenticated
    }

    @Published var method: AuthMethod = .phone
    @Published var displayName: String = ""
    @Published var contact: String = ""
    @Published var code: String = ""
    @Published var isRequestingCode: Bool = false
    @Published var isVerifyingCode: Bool = false
    @Published var errorMessage: String?
    @Published var isCodeSent: Bool = false
    @Published var codeExpirationSeconds: Int?
    @Published var state: AuthState = .unauthenticated

    private let authService: AuthNetworking
    let sessionStore: SessionStore

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

    func reset() {
        displayName = ""
        contact = ""
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
