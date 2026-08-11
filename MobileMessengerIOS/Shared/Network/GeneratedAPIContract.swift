// Generated from contracts/openapi.json. Do not edit manually.
import Foundation

public enum GeneratedAPIContract {
    public enum Operation: String, CaseIterable {
        case acceptContactRequest
        case adminLogin
        case adminMe
        case authLogin
        case authMe
        case authRequest
        case authTelegramPairing
        case authVerify
        case blockContact
        case claimDeviceKeyBundles
        case confirmEncryptedMediaUpload
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
        case getEncryptedMediaDownload
        case getEncryptedMessageInbox
        case getMyLocation
        case getOneTimePrekeyStatus
        case getPushStatus
        case getVapidPublicKey
        case grantLocationPermission
        case health
        case labLogin
        case listAdminSessions
        case listAuthSessions
        case listChats
        case listContactLocations
        case listContactRequests
        case listContacts
        case listDevices
        case listLocationPermissions
        case listMessages
        case logoutAdminSession
        case logoutAuthSession
        case markEncryptedEnvelopeDelivered
        case markEncryptedEnvelopeRead
        case markMessageRead
        case publishOneTimePrekeys
        case realtimeEvents
        case refreshAdminSession
        case refreshAuthSession
        case registerDevice
        case registerPushDevice
        case registerPushSubscription
        case rejectContactRequest
        case requestEncryptedMediaUpload
        case requestMediaUpload
        case revokeAdminSession
        case revokeAuthSession
        case revokeDevice
        case revokeLocationPermission
        case rootDocs
        case sendMessage
        case setTyping
        case stopLocationSharing
        case submitEncryptedMessage
        case systemErrorLogs
        case systemOverview
        case systemRequestLogs
        case testPush
        case unblockContact
        case updateDeviceKeys
        case updateMessage
        case updateMyLocation
        case updateProfile
        case uploadVoiceMedia
        case version
    }

    public static func path(
        _ operation: Operation,
        parameters: [String: String] = [:]
    ) -> String {
        let template = switch operation {
        case .acceptContactRequest: "contacts/requests/{requestID}/accept"
        case .adminLogin: "admin/login"
        case .adminMe: "admin/me"
        case .authLogin: "auth/login"
        case .authMe: "auth/me"
        case .authRequest: "auth/request"
        case .authTelegramPairing: "auth/telegram/pairing"
        case .authVerify: "auth/verify"
        case .blockContact: "contacts/{userID}/block"
        case .claimDeviceKeyBundles: "devices/key-bundles/{userID}"
        case .confirmEncryptedMediaUpload: "media/encrypted/{attachmentID}/confirm"
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
        case .getEncryptedMediaDownload: "media/encrypted/{attachmentID}/download-url"
        case .getEncryptedMessageInbox: "encrypted-messages/inbox"
        case .getMyLocation: "location/me"
        case .getOneTimePrekeyStatus: "devices/current/prekeys"
        case .getPushStatus: "push/status"
        case .getVapidPublicKey: "push/vapid-public-key"
        case .grantLocationPermission: "location/permissions/{granteeUserID}"
        case .health: "health"
        case .labLogin: "login"
        case .listAdminSessions: "admin/sessions"
        case .listAuthSessions: "auth/sessions"
        case .listChats: "chats"
        case .listContactLocations: "location/contacts"
        case .listContactRequests: "contacts/requests"
        case .listContacts: "contacts"
        case .listDevices: "devices"
        case .listLocationPermissions: "location/permissions"
        case .listMessages: "chats/{chatID}/messages"
        case .logoutAdminSession: "admin/logout"
        case .logoutAuthSession: "auth/logout"
        case .markEncryptedEnvelopeDelivered: "encrypted-messages/inbox/{envelopeID}/delivered"
        case .markEncryptedEnvelopeRead: "encrypted-messages/inbox/{envelopeID}/read"
        case .markMessageRead: "chats/{chatID}/messages/{messageID}/read"
        case .publishOneTimePrekeys: "devices/current/prekeys"
        case .realtimeEvents: "realtime/events"
        case .refreshAdminSession: "admin/refresh"
        case .refreshAuthSession: "auth/refresh"
        case .registerDevice: "devices/register"
        case .registerPushDevice: "push/devices"
        case .registerPushSubscription: "push/subscriptions"
        case .rejectContactRequest: "contacts/requests/{requestID}/reject"
        case .requestEncryptedMediaUpload: "media/encrypted/upload-url"
        case .requestMediaUpload: "media/upload-url"
        case .revokeAdminSession: "admin/sessions/{sessionId}"
        case .revokeAuthSession: "auth/sessions/{sessionId}"
        case .revokeDevice: "devices/{deviceID}/revoke"
        case .revokeLocationPermission: "location/permissions/{granteeUserID}"
        case .rootDocs: ""
        case .sendMessage: "chats/{chatID}/messages"
        case .setTyping: "chats/{chatID}/typing"
        case .stopLocationSharing: "location/me"
        case .submitEncryptedMessage: "encrypted-messages"
        case .systemErrorLogs: "system/logs/errors"
        case .systemOverview: "system/overview"
        case .systemRequestLogs: "system/logs/requests"
        case .testPush: "push/test"
        case .unblockContact: "contacts/{userID}/unblock"
        case .updateDeviceKeys: "devices/current/keys"
        case .updateMessage: "chats/{chatID}/messages/{messageID}"
        case .updateMyLocation: "location/me"
        case .updateProfile: "users/me/profile"
        case .uploadVoiceMedia: "media/voice"
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
