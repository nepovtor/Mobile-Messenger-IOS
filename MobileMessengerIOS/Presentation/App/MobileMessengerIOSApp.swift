import SwiftUI
import UserNotifications

@main
struct MobileMessengerIOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }

    private func configureAppearance() {
        UINavigationBar.appearance().largeTitleTextAttributes = [.foregroundColor: UIColor.label]
        UINavigationBar.appearance().titleTextAttributes = [.foregroundColor: UIColor.label]
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushNotificationManager.shared.didRegister(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushNotificationManager.shared.didFailToRegister(error: error)
    }
}
