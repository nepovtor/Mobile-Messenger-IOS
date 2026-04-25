import Foundation

/// Safe API response parser that handles malformed JSON, empty responses, and non-JSON content.
///
/// Prevents exposing technical errors like "The data couldn't be read because it isn't in the correct format."
/// to users. Instead, converts them to friendly, actionable messages.
public struct APIResponseParser {
    public struct ParseError: LocalizedError {
        public let userMessage: String
        public let technicalDetails: String?
        public let isRetryable: Bool
        
        public var errorDescription: String? {
            userMessage
        }
        
        init(userMessage: String, technicalDetails: String? = nil, isRetryable: Bool = false) {
            self.userMessage = userMessage
            self.technicalDetails = technicalDetails
            self.isRetryable = isRetryable
        }
    }
    
    /// Safely parse JSON from HTTP response data.
    /// 
    /// - Parameters:
    ///   - data: Raw response data
    ///   - contentType: HTTP Content-Type header value
    ///   - statusCode: HTTP status code
    ///   - decoder: JSONDecoder instance
    /// 
    /// - Returns: Decoded object of type T
    /// - Throws: ParseError with friendly user message
    public static func parseJSON<T: Decodable>(
        data: Data,
        contentType: String?,
        statusCode: Int,
        decoder: JSONDecoder = JSONDecoder()
    ) throws -> T {
        // Empty response
        if data.isEmpty {
            let details = "Status: \(statusCode), Content-Type: \(contentType ?? "none")"
            throw ParseError(
                userMessage: "Server returned an empty response. Please try again.",
                technicalDetails: "Empty response body. \(details)",
                isRetryable: statusCode >= 500
            )
        }
        
        // Check Content-Type
        let isJSON = isJSONContent(contentType)
        
        // Try to detect if content looks like JSON
        let contentPreview = String(data: data.prefix(100), encoding: .utf8) ?? ""
        let looksLikeJSON = contentPreview.trimmingCharacters(in: .whitespacesAndNewlines).first == "{"
            || contentPreview.trimmingCharacters(in: .whitespacesAndNewlines).first == "["
        
        if !isJSON && !looksLikeJSON {
            // Non-JSON content (HTML error page, plain text, etc.)
            let textContent = String(data: data, encoding: .utf8) ?? ""
            let sanitized = sanitizeErrorText(textContent).prefix(200)
            
            let userMessage = buildUserMessage(
                statusCode: statusCode,
                fallback: "Server returned an invalid response format."
            )
            
            throw ParseError(
                userMessage: userMessage,
                technicalDetails: "Non-JSON response. Content-Type: \(contentType ?? "none"). First 200 chars: \(sanitized)",
                isRetryable: statusCode >= 500
            )
        }
        
        // Try to decode JSON
        do {
            return try decoder.decode(T.self, from: data)
        } catch let decodingError {
            // JSON parsing failed - likely malformed JSON
            let errorSummary = summarizeDecodingError(decodingError)
            let userMessage = buildUserMessage(
                statusCode: statusCode,
                fallback: "Received data is corrupted or in an unexpected format."
            )
            
            throw ParseError(
                userMessage: userMessage,
                technicalDetails: "JSON decoding failed: \(errorSummary)",
                isRetryable: false
            )
        }
    }
    
    /// Safely parse JSON from HTTP response and optional error payload.
    /// 
    /// First attempts to extract a friendly error message from response body,
    /// then falls back to status-code-based message.
    public static func buildErrorMessage(
        from data: Data,
        statusCode: Int,
        contentType: String?
    ) -> String {
        // Try to extract structured error message
        if let errorMessage = extractErrorMessage(from: data) {
            return errorMessage
        }
        
        // Try to use plain text if it's short and looks safe
        if let text = String(data: data, encoding: .utf8) {
            let sanitized = sanitizeErrorText(text)
            if !sanitized.isEmpty && sanitized.count < 200 {
                return sanitized
            }
        }
        
        // Fall back to status code message
        return buildUserMessage(statusCode: statusCode, fallback: "Request failed.")
    }
    
    // MARK: - Private Helpers
    
    private static func isJSONContent(_ contentType: String?) -> Bool {
        guard let contentType = contentType else {
            return false
        }
        let lower = contentType.lowercased()
        return lower.contains("application/json") || lower.contains("application/json")
    }
    
    private static func extractErrorMessage(from data: Data) -> String? {
        // Try to parse as structured error response
        struct ErrorPayload: Decodable {
            let message: String?
            let error: String?
        }
        
        if let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data) {
            if let message = payload.message, !message.isEmpty {
                return sanitizeErrorText(message)
            }
            if let error = payload.error, !error.isEmpty {
                return sanitizeErrorText(error)
            }
        }
        
        return nil
    }
    
    private static func sanitizeErrorText(_ text: String) -> String {
        // Remove HTML tags, excessive whitespace, etc.
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Remove HTML tags if present
        let noHTML = trimmed
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        
        // Remove control characters
        let safe = noHTML
            .filter { !$0.isLetter && !$0.isNumber && !CharacterSet(charactersIn: " .,;:-'\"!?()").contains($0.unicodeScalars.first ?? " ") || $0.isLetter || $0.isNumber }
        
        return safe.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    private static func buildUserMessage(statusCode: Int, fallback: String) -> String {
        switch statusCode {
        case 400...499:
            return "Request failed. Please check your input and try again."
        case 500...599:
            return "Backend is unavailable. Please try again later."
        case 200..<300:
            return fallback
        default:
            return "Request failed. Please try again."
        }
    }
    
    private static func summarizeDecodingError(_ error: Error) -> String {
        if let decodingError = error as? DecodingError {
            switch decodingError {
            case .keyNotFound(let key, _):
                return "Missing field: \(key.stringValue)"
            case .valueNotFound(let type, _):
                return "Missing value for type: \(type)"
            case .typeMismatch(let type, _):
                return "Type mismatch for \(type)"
            case .dataCorrupted(_):
                return "Data is corrupted"
            @unknown default:
                return "Unknown decoding error"
            }
        }
        return "JSON parsing error: \(error.localizedDescription)"
    }
}

extension APIResponseParser {
    /// Logs detailed error information for debugging (only in verbose mode or debug builds)
    public static func logDebugInfo(_ error: ParseError) {
        #if DEBUG
        if let technicalDetails = error.technicalDetails {
            print("[API] Error - \(error.userMessage)")
            print("[API] Details - \(technicalDetails)")
        }
        #endif
    }
}
