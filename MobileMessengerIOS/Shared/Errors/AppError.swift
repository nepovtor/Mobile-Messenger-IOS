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

    public static func presentableMessage(for error: Error) -> String {
        if let appError = error as? AppError, let description = appError.errorDescription {
            return description
        }

        if let parseError = error as? APIResponseParser.ParseError,
           parseError.backendCode == "TELEGRAM_NOT_LINKED" {
            return "Откройте Telegram-бота, нажмите /start, отправьте туда свой номер и затем запросите код снова."
        }

        if let parseError = error as? APIResponseParser.ParseError {
            switch parseError.backendCode {
            case "USER_NOT_FOUND":
                return "Пользователь с таким номером не найден."
            case "CANNOT_ADD_SELF":
                return "Нельзя добавить свой собственный аккаунт."
            default:
                break
            }
        }

        if let configError = error as? ConfigError, let description = configError.errorDescription {
            return description
        }

        let rawMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        let trimmed = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)

        let friendlyMessages = [
            "Server returned an invalid response.",
            "Backend is unavailable. Please try again later.",
            "Request failed. Please check API configuration."
        ]
        if friendlyMessages.contains(trimmed) {
            return trimmed
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .badURL, .unsupportedURL, .cannotFindHost, .dnsLookupFailed:
                return "Request failed. Please check API configuration."
            case .timedOut,
                 .cannotConnectToHost,
                 .networkConnectionLost,
                 .notConnectedToInternet,
                 .resourceUnavailable,
                 .secureConnectionFailed,
                 .serverCertificateHasBadDate,
                 .serverCertificateUntrusted,
                 .serverCertificateHasUnknownRoot,
                 .serverCertificateNotYetValid:
                return "Backend is unavailable. Please try again later."
            default:
                return "Server returned an invalid response."
            }
        }

        let technicalFragments = [
            "the data couldn",
            "the data could not",
            "correct format",
            "json",
            "decoding",
            "unexpected token",
            "html",
            "doctype",
            "nsurl",
            "nscocoaerrordomain"
        ]
        let lowercase = trimmed.lowercased()
        if technicalFragments.contains(where: { lowercase.contains($0) }) {
            return "Server returned an invalid response."
        }

        return trimmed.isEmpty ? "Server returned an invalid response." : trimmed
    }

    public static func wrapped(_ error: Error) -> AppError {
        if let appError = error as? AppError {
            return appError
        }

        return .network(description: presentableMessage(for: error))
    }
}
