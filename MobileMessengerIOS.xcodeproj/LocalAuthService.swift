import Foundation

public struct LocalAuthService: AuthNetworking {
    public init() {}

    public func requestCode(method: AuthMethod, contact: String) async throws -> AuthCodeResponse? {
        // Эмулируем отправку кода: задержка и "код" действует 120 секунд
        try await Task.sleep(nanoseconds: 300_000_000)
        return AuthCodeResponse(expiresIn: 120)
    }

    public func verifyCode(method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        // Эмулируем проверку: любой код длиной >= 4 — успешный
        try await Task.sleep(nanoseconds: 200_000_000)
        guard code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4 else {
            throw AppError.network(description: "Неверный код подтверждения")
        }
        return AuthVerifyResponse(
            token: "local-dev-token",
            userID: SessionStore.Constants.currentUserID,
            displayName: SessionStore.Constants.currentUserDisplayName
        )
    }
}

// Простейшая ошибка приложения, если её ещё нет в проекте.
// Если у вас уже есть AppError — удалите этот enum ниже и используйте ваш существующий.
public enum AppError: LocalizedError, Sendable {
    case network(description: String)
    case unknown

    public var errorDescription: String? {
        switch self {
        case .network(let description):
            return description
        case .unknown:
            return "Неизвестная ошибка"
        }
    }
}
