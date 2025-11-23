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
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        DefaultAnalyticsService.shared.track(event: AnalyticsEvent(kind: .pushRegistered, metadata: ["token": token]))
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
