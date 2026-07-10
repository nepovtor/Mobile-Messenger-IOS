// Generated from contracts/openapi.json. Do not edit manually.
import Foundation

public enum GeneratedAPIContract {
    public enum Operation: String, CaseIterable {
        case adminLogin
        case adminMe
        case authLogin
        case authMe
        case authRequest
        case authTelegramPairing
        case authVerify
        case confirmMediaUpload
        case createChat
        case createContact
        case createUser
        case deleteChat
        case deleteContact
        case deleteMessage
        case deletePushDevice
        case deletePushSubscription
        case deletePushSubscriptionFallback
        case getMyLocation
        case getPushStatus
        case getVapidPublicKey
        case health
        case labLogin
        case listChats
        case listContactLocations
        case listContacts
        case listMessages
        case markMessageRead
        case realtimeEvents
        case registerPushDevice
        case registerPushSubscription
        case requestMediaUpload
        case rootDocs
        case sendMessage
        case setTyping
        case stopLocationSharing
        case systemErrorLogs
        case systemOverview
        case systemRequestLogs
        case testPush
        case updateMessage
        case updateMyLocation
        case updateProfile
        case version
    }

    public static func path(
        _ operation: Operation,
        parameters: [String: String] = [:]
    ) -> String {
        let template = switch operation {
        case .adminLogin: "admin/login"
        case .adminMe: "admin/me"
        case .authLogin: "auth/login"
        case .authMe: "auth/me"
        case .authRequest: "auth/request"
        case .authTelegramPairing: "auth/telegram/pairing"
        case .authVerify: "auth/verify"
        case .confirmMediaUpload: "media/{mediaID}/confirm"
        case .createChat: "chats"
        case .createContact: "contacts"
        case .createUser: "users"
        case .deleteChat: "chats/{chatID}"
        case .deleteContact: "contacts/{identifier}"
        case .deleteMessage: "chats/{chatID}/messages/{messageID}"
        case .deletePushDevice: "push/devices/{token}"
        case .deletePushSubscription: "push/subscriptions"
        case .deletePushSubscriptionFallback: "push/subscriptions/delete"
        case .getMyLocation: "location/me"
        case .getPushStatus: "push/status"
        case .getVapidPublicKey: "push/vapid-public-key"
        case .health: "health"
        case .labLogin: "login"
        case .listChats: "chats"
        case .listContactLocations: "location/contacts"
        case .listContacts: "contacts"
        case .listMessages: "chats/{chatID}/messages"
        case .markMessageRead: "chats/{chatID}/messages/{messageID}/read"
        case .realtimeEvents: "realtime/events"
        case .registerPushDevice: "push/devices"
        case .registerPushSubscription: "push/subscriptions"
        case .requestMediaUpload: "media/upload-url"
        case .rootDocs: ""
        case .sendMessage: "chats/{chatID}/messages"
        case .setTyping: "chats/{chatID}/typing"
        case .stopLocationSharing: "location/me"
        case .systemErrorLogs: "system/logs/errors"
        case .systemOverview: "system/overview"
        case .systemRequestLogs: "system/logs/requests"
        case .testPush: "push/test"
        case .updateMessage: "chats/{chatID}/messages/{messageID}"
        case .updateMyLocation: "location/me"
        case .updateProfile: "users/me/profile"
        case .version: "version"
        }
        return parameters.reduce(template) { result, entry in
            result.replacingOccurrences(
                of: "{\(entry.key)}",
                with: entry.value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? entry.value
            )
        }
    }
}
