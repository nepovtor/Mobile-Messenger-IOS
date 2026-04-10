import Foundation

@MainActor
public final class AuthViewModel: ObservableObject {
    @Published public var method: AuthMethod = .phone
    @Published public var contact: String = ""
    @Published public var code: String = ""
    @Published public var isRequestingCode: Bool = false
    @Published public var isVerifyingCode: Bool = false
    @Published public var errorMessage: String?
    @Published public var isCodeSent: Bool = false
    @Published public var codeExpirationSeconds: Int?

    private let authService: AuthNetworking
    let sessionStore: SessionStore

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
            sessionStore.authenticate(with: response.token, userID: response.userID, displayName: response.displayName)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func reset() {
        contact = ""
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
}
