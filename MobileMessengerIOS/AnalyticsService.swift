import Foundation
import os.log

protocol AnalyticsService {
    func trackChatOpened(chatID: UUID)
    func trackMessageSent(chatID: UUID, messageID: UUID)
    func trackMessageReceived(chatID: UUID, messageID: UUID)
    func trackNetworkError(_ error: Error)
    func trackStorageError(_ error: Error)
    func trackNotificationError(_ error: Error)
}

final class DefaultAnalyticsService: AnalyticsService {
    static let shared = DefaultAnalyticsService()

    private let logger = Logger(subsystem: "com.mobilemessenger.app", category: "analytics")
    private let queue = DispatchQueue(label: "analytics.queue", qos: .utility)

    private init() {}

    func trackChatOpened(chatID: UUID) {
        log("chat_opened", metadata: ["chat_id": "\(chatID.uuidString)"])
    }

    func trackMessageSent(chatID: UUID, messageID: UUID) {
        log("message_sent", metadata: [
            "chat_id": "\(chatID.uuidString)",
            "message_id": "\(messageID.uuidString)"
        ])
    }

    func trackMessageReceived(chatID: UUID, messageID: UUID) {
        log("message_received", metadata: [
            "chat_id": "\(chatID.uuidString)",
            "message_id": "\(messageID.uuidString)"
        ])
    }

    func trackNetworkError(_ error: Error) {
        log("network_error", metadata: ["description": error.localizedDescription])
    }

    func trackStorageError(_ error: Error) {
        log("storage_error", metadata: ["description": error.localizedDescription])
    }

    func trackNotificationError(_ error: Error) {
        log("notification_error", metadata: ["description": error.localizedDescription])
    }

    private func log(_ event: String, metadata: [String: String]) {
        queue.async { [logger] in
            let message = metadata.map { "\($0.key)=\($0.value)" }.joined(separator: ", ")
            logger.info("[\(event)] \(message)")
        }
    }
}
