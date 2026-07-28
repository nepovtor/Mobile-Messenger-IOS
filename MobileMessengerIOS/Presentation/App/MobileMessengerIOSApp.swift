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
        UIView.appearance().tintColor = AppTheme.primaryUIColor

        let navigationAppearance = UINavigationBarAppearance()
        navigationAppearance.configureWithDefaultBackground()
        navigationAppearance.shadowColor = .clear
        navigationAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor.label]
        navigationAppearance.titleTextAttributes = [.foregroundColor: UIColor.label]

        let navigationScrollEdgeAppearance = UINavigationBarAppearance()
        navigationScrollEdgeAppearance.configureWithTransparentBackground()
        navigationScrollEdgeAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor.label]
        navigationScrollEdgeAppearance.titleTextAttributes = [.foregroundColor: UIColor.label]

        UINavigationBar.appearance().standardAppearance = navigationAppearance
        UINavigationBar.appearance().compactAppearance = navigationAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationScrollEdgeAppearance
        UINavigationBar.appearance().tintColor = AppTheme.primaryUIColor

        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithDefaultBackground()

        let selectedAppearance = tabBarAppearance.stackedLayoutAppearance.selected
        selectedAppearance.iconColor = AppTheme.primaryUIColor
        selectedAppearance.titleTextAttributes = [.foregroundColor: AppTheme.primaryUIColor]

        let normalAppearance = tabBarAppearance.stackedLayoutAppearance.normal
        normalAppearance.iconColor = UIColor.secondaryLabel
        normalAppearance.titleTextAttributes = [.foregroundColor: UIColor.secondaryLabel]

        UITabBar.appearance().standardAppearance = tabBarAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
        UITabBar.appearance().tintColor = AppTheme.primaryUIColor
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
