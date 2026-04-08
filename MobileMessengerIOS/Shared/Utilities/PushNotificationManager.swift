import Foundation
import UIKit
import UserNotifications

private enum NotificationPreferenceKeys {
    static let notificationsEnabled = AppPreferenceKeys.notificationsEnabled
    static let quietHoursEnabled = AppPreferenceKeys.quietHoursEnabled
}

@MainActor
final class PushNotificationManager: NSObject, ObservableObject {
    static let shared = PushNotificationManager()

    private override init() {
        super.init()
    }

    func registerForNotifications() async {
        await requestLocalAuthorizationIfNeeded()
    }

    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        DefaultAnalyticsService.shared.track(.pushRegistered, metadata: ["token": token])
    }

    func didFailToRegister(error: Error) {
        DefaultAnalyticsService.shared.track(error: error, context: "push_register")
    }

    func scheduleLocalNotification(for message: Message) {
        guard notificationsEnabled, !quietHoursEnabled else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = message.authorName
        content.body = message.text
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(identifier: message.id.messageID.uuidString, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }

    func syncNotificationPreferences() {
        let center = UNUserNotificationCenter.current()
        if !notificationsEnabled {
            center.removeAllPendingNotificationRequests()
            center.removeAllDeliveredNotifications()
            center.setBadgeCount(0) { _ in }
            return
        }

        Task {
            await requestLocalAuthorizationIfNeeded()
        }
    }

    private var notificationsEnabled: Bool {
        if UserDefaults.standard.object(forKey: NotificationPreferenceKeys.notificationsEnabled) == nil {
            return true
        }
        return UserDefaults.standard.bool(forKey: NotificationPreferenceKeys.notificationsEnabled)
    }

    private var quietHoursEnabled: Bool {
        UserDefaults.standard.bool(forKey: NotificationPreferenceKeys.quietHoursEnabled)
    }

    private func requestLocalAuthorizationIfNeeded() async {
        guard notificationsEnabled else {
            syncNotificationPreferences()
            return
        }

        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            do {
                _ = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            } catch {
                DefaultAnalyticsService.shared.track(error: error, context: "local_notification_authorization")
            }
        case .authorized, .provisional, .ephemeral:
            break
        case .denied:
            DefaultAnalyticsService.shared.track(error: AppError.network(description: "Notifications permission denied"), context: "local_notification_authorization")
        @unknown default:
            break
        }
    }
}
