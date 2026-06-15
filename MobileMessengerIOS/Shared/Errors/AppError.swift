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

        if let mediaMessage = mediaUploadMessage(for: error) {
            return mediaMessage
        }

        if let parseError = error as? APIResponseParser.ParseError,
           parseError.backendCode == "TELEGRAM_NOT_LINKED" {
            return "Сначала привяжите Telegram через кнопку выше и отправьте свой контакт боту."
        }

        if let parseError = error as? APIResponseParser.ParseError {
            switch parseError.backendCode {
            case "USER_NOT_FOUND":
                return "Пользователь с таким номером не найден."
            case "CANNOT_ADD_SELF":
                return "Нельзя добавить самого себя."
            default:
                break
            }
        }

        if let configError = error as? ConfigError, let description = configError.errorDescription {
            return description
        }

        let rawMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        let trimmed = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)

        if let friendly = friendlyBackendMessage(for: trimmed) {
            return friendly
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .badURL, .unsupportedURL, .cannotFindHost, .dnsLookupFailed:
                return "Не удалось выполнить запрос. Проверьте настройки подключения."
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
                return "Сервис временно недоступен. Попробуйте позже."
            default:
                return "Сервер вернул некорректный ответ."
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
            return "Сервер вернул некорректный ответ."
        }

        return trimmed.isEmpty ? "Сервер вернул некорректный ответ." : trimmed
    }

    public static func wrapped(_ error: Error) -> AppError {
        if let appError = error as? AppError {
            return appError
        }

        return .network(description: presentableMessage(for: error))
    }

    private static func friendlyBackendMessage(for message: String) -> String? {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let lowercase = trimmed.lowercased()

        switch lowercase {
        case "server returned an invalid response.":
            return "Сервер вернул некорректный ответ."
        case "backend is unavailable. please try again later.":
            return "Сервис временно недоступен. Попробуйте позже."
        case "request failed. please check api configuration.":
            return "Не удалось выполнить запрос. Проверьте настройки подключения."
        case "invalid verification code":
            return "Неверный код подтверждения."
        case "verification code expired":
            return "Срок действия кода истек. Запросите новый код."
        case "too many verification attempts":
            return "Слишком много попыток. Запросите новый код и попробуйте позже."
        case "verification provider unavailable":
            return "Сервис подтверждения временно недоступен. Попробуйте позже."
        case "telegram pairing unavailable":
            return "Привязка Telegram временно недоступна."
        case "password login is disabled":
            return "Вход по паролю отключен."
        case "invalid demo credentials":
            return "Неверный пароль."
        case "user not found":
            return "Пользователь не найден."
        case "invalid or expired token":
            return "Сессия истекла. Пожалуйста, войдите снова."
        default:
            break
        }

        if lowercase.hasPrefix("resend cooldown active.") {
            return "Код уже отправлен. Подождите немного перед повторным запросом."
        }

        if lowercase.contains("too many auth requests") {
            return "Слишком много запросов. Попробуйте позже."
        }

        if lowercase.contains("too many auth attempts") {
            return "Слишком много попыток входа. Попробуйте позже."
        }

        return nil
    }

    private static func mediaUploadMessage(for error: Error) -> String? {
        let rawMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        let lowercase = rawMessage.lowercased()

        if lowercase.contains("failed to access media bucket") ||
            lowercase.contains("uploaded media file was not found") ||
            lowercase.contains("media upload is not confirmed") {
            return "Загрузка медиа временно недоступна."
        }

        return nil
    }
}
