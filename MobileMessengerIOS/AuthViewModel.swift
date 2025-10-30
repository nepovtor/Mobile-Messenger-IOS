import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var method: AuthMethod = .phone
    @Published var contact: String = ""
    @Published var code: String = ""
    @Published var isRequestingCode: Bool = false
    @Published var isVerifyingCode: Bool = false
    @Published var errorMessage: String?
    @Published var isCodeSent: Bool = false
    @Published var authToken: String?
    @Published var codeExpirationSeconds: Int?

    private let service: AuthService

    init(service: AuthService = AuthService()) {
        self.service = service
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

    var isCodeValid: Bool {
        code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4
    }

    func requestCode() async {
        guard !isRequestingCode else { return }
        errorMessage = nil
        authToken = nil
        codeExpirationSeconds = nil
        isRequestingCode = true
        defer { isRequestingCode = false }

        let sanitizedContact = sanitize(contact: contact)

        do {
            let response = try await service.requestCode(for: method, contact: sanitizedContact)
            isCodeSent = true
            codeExpirationSeconds = response?.expiresIn
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func verifyCode() async {
        guard !isVerifyingCode else { return }
        errorMessage = nil
        isVerifyingCode = true
        defer { isVerifyingCode = false }

        let sanitizedContact = sanitize(contact: contact)
        let sanitizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let response = try await service.verifyCode(for: method, contact: sanitizedContact, code: sanitizedCode)
            authToken = response.token
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func reset() {
        contact = ""
        code = ""
        errorMessage = nil
        isCodeSent = false
        authToken = nil
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
