import Foundation

public enum AppError: LocalizedError, Sendable {
    case network(description: String)
    case storage(description: String)
    case unauthorized
    case unknown

    public var errorDescription: String? {
        switch self {
        case .network(let description):
            return description
        case .storage(let description):
            return description
        case .unauthorized:
            return AppLanguagePreference.localized(ru: "Сессия истекла. Пожалуйста, войдите снова.", en: "Your session has expired. Please sign in again.")
        case .unknown:
            return AppLanguagePreference.localized(ru: "Что-то пошло не так. Попробуйте позже.", en: "Something went wrong. Please try again later.")
        }
    }
}
