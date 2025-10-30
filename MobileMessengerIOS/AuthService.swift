import Foundation

enum AuthError: LocalizedError {
    case invalidURL
    case invalidResponse
    case server(message: String)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Не удалось сформировать запрос."
        case .invalidResponse:
            return "Получен некорректный ответ от сервера."
        case .server(let message):
            return message
        case .transport(let error):
            return error.localizedDescription
        }
    }
}

struct AuthRequestResponse: Decodable {
    let expiresIn: Int?
}

struct AuthVerifyResponse: Decodable {
    let token: String
}

struct APIErrorResponse: Decodable {
    let message: String
}

final class AuthService {
    private let baseURL: URL
    private let urlSession: URLSession

    init(baseURL: URL = AuthService.resolveBaseURL(), urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.urlSession = urlSession
    }

    private static func resolveBaseURL() -> URL {
        if let urlString = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           let url = URL(string: urlString) {
            return url
        }

        return URL(string: "https://api.example.com")!
    }

    func requestCode(for method: AuthMethod, contact: String) async throws -> AuthRequestResponse? {
        let endpoint = baseURL.appendingPathComponent("auth/request-code")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = [
            "channel": method.rawValue,
            "contact": contact
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        do {
            let (data, response) = try await urlSession.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AuthError.invalidResponse
            }

            switch httpResponse.statusCode {
            case 200..<300:
                if data.isEmpty {
                    return nil
                }
                return try? JSONDecoder().decode(AuthRequestResponse.self, from: data)
            default:
                if let apiError = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                    throw AuthError.server(message: apiError.message)
                }
                throw AuthError.invalidResponse
            }
        } catch let error as AuthError {
            throw error
        } catch {
            throw AuthError.transport(error)
        }
    }

    func verifyCode(for method: AuthMethod, contact: String, code: String) async throws -> AuthVerifyResponse {
        let endpoint = baseURL.appendingPathComponent("auth/verify-code")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = [
            "channel": method.rawValue,
            "contact": contact,
            "code": code
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        do {
            let (data, response) = try await urlSession.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AuthError.invalidResponse
            }

            switch httpResponse.statusCode {
            case 200..<300:
                return try JSONDecoder().decode(AuthVerifyResponse.self, from: data)
            default:
                if let apiError = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                    throw AuthError.server(message: apiError.message)
                }
                throw AuthError.invalidResponse
            }
        } catch let error as AuthError {
            throw error
        } catch {
            throw AuthError.transport(error)
        }
    }
}
