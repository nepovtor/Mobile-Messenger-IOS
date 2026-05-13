import SwiftUI
import UserNotifications

@main
struct MobileMessengerIOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        configureAppearance()
        Task { @MainActor in
            PushNotificationManager.shared.installNotificationDelegate()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }

    private func configureAppearance() {
        let navigationAppearance = UINavigationBarAppearance()
        navigationAppearance.configureWithTransparentBackground()
        navigationAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        navigationAppearance.backgroundColor = UIColor.white.withAlphaComponent(0.06)
        navigationAppearance.shadowColor = .clear
        navigationAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor.label]
        navigationAppearance.titleTextAttributes = [.foregroundColor: UIColor.label]

        UINavigationBar.appearance().standardAppearance = navigationAppearance
        UINavigationBar.appearance().compactAppearance = navigationAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationAppearance

        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithTransparentBackground()
        tabBarAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        tabBarAppearance.backgroundColor = UIColor.white.withAlphaComponent(0.05)
        tabBarAppearance.shadowColor = .clear

        let selectedAppearance = tabBarAppearance.stackedLayoutAppearance.selected
        selectedAppearance.iconColor = UIColor.systemBlue
        selectedAppearance.titleTextAttributes = [.foregroundColor: UIColor.systemBlue]

        let normalAppearance = tabBarAppearance.stackedLayoutAppearance.normal
        normalAppearance.iconColor = UIColor.secondaryLabel
        normalAppearance.titleTextAttributes = [.foregroundColor: UIColor.secondaryLabel]

        UITabBar.appearance().standardAppearance = tabBarAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { @MainActor in
            PushNotificationManager.shared.installNotificationDelegate()
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            PushNotificationManager.shared.didRegister(deviceToken: deviceToken)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in
            PushNotificationManager.shared.didFailToRegister(error: error)
        }
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable : Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        _ = application
        PushNotificationManager.shared.handleRemoteNotification(userInfo: userInfo) {
            completionHandler(.noData)
        }
    }
}
