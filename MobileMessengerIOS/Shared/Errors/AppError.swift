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
            return "Сессия истекла. Пожалуйста, войдите снова."
        case .unknown:
            return "Что-то пошло не так. Попробуйте позже."
        }
    }
}
