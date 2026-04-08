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
        guard notificationsEnabled else {
            syncNotificationPreferences()
            return
        }

        let center = UNUserNotificationCenter.current()
        let options: UNAuthorizationOptions = [.alert, .badge, .sound]
        do {
            let granted = try await center.requestAuthorization(options: options)
            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        } catch {
            print("Push authorization error: \(error)")
        }
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
        guard !notificationsEnabled else { return }
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        center.removeAllDeliveredNotifications()
        center.setBadgeCount(0) { _ in }
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
}
