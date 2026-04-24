import Foundation
import UIKit
import UserNotifications

@MainActor
final class PushNotificationManager: NSObject, ObservableObject {
    static let shared = PushNotificationManager()

    private override init() {
        super.init()
    }

    func registerForNotifications() async {
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
        _ = deviceToken
        DefaultAnalyticsService.shared.track(.pushRegistered)
    }

    func didFailToRegister(error: Error) {
        DefaultAnalyticsService.shared.track(error: error, context: "push_register")
    }

    func scheduleLocalNotification(for message: Message) {
        let content = UNMutableNotificationContent()
        content.title = message.authorName
        content.body = message.text
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(identifier: message.id.messageID.uuidString, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }
}
