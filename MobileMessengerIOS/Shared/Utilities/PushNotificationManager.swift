import Foundation
import UIKit
import UserNotifications

@MainActor
final class PushNotificationManager: NSObject, ObservableObject {
    enum AuthorizationState: Equatable {
        case unknown
        case notDetermined
        case denied
        case authorized
    }

    enum SyncState: Equatable {
        case idle
        case registering
        case synced
        case failed
    }

    static let shared = PushNotificationManager()

    @Published private(set) var authorizationState: AuthorizationState = .unknown
    @Published private(set) var syncState: SyncState = .idle
    @Published private(set) var latestDeviceToken: String?
    @Published private(set) var lastErrorMessage: String?

    private let analytics: AnalyticsService = DefaultAnalyticsService.shared
    private var pushService: PushDeviceNetworking?
    private var isPushFeatureEnabled: @MainActor () -> Bool = { true }
    private var isSessionAuthenticated: @MainActor () -> Bool = { false }
    private var routeHandler: @MainActor (UUID?) -> Void = { _ in }
    private var bundleIDProvider: @MainActor () -> String? = {
        Bundle.main.bundleIdentifier
    }
    private var environmentProvider: @MainActor () -> PushDeviceEnvironment = {
        #if DEBUG
        .sandbox
        #else
        .production
        #endif
    }
    private var lastSyncedToken: String?

    private override init() {
        super.init()
        installNotificationDelegate()
        Task {
            await refreshAuthorizationState()
        }
    }

    var statusTitle: String {
        guard isPushFeatureEnabled() else {
            return "Выключено в конфигурации"
        }

        switch authorizationState {
        case .unknown:
            return "Проверяем"
        case .notDetermined:
            return "Ожидает разрешения"
        case .denied:
            return "Нет разрешения"
        case .authorized:
            switch syncState {
            case .synced:
                return "Включено"
            case .registering:
                return "Регистрируем"
            case .failed:
                return "Нужно внимание"
            case .idle:
                return latestDeviceToken == nil ? "Ждём APNs token" : "Разрешено"
            }
        }
    }

    var statusDetail: String {
        guard isPushFeatureEnabled() else {
            return "Feature flag FEATURE_PUSH отключён в конфигурации приложения."
        }

        switch authorizationState {
        case .unknown:
            return "Проверяем разрешение и системное состояние уведомлений."
        case .notDetermined:
            return "Разрешение на push ещё не запрашивалось на этом устройстве."
        case .denied:
            return "Включите уведомления для приложения в Settings, чтобы получать новые сообщения."
        case .authorized:
            switch syncState {
            case .synced:
                return "APNs token зарегистрирован на backend, новые входящие сообщения будут приходить как remote push."
            case .registering:
                return "Синхронизируем APNs token с backend и ждём подтверждения."
            case .failed:
                return lastErrorMessage ?? "Не удалось завершить регистрацию устройства на backend."
            case .idle:
                if latestDeviceToken == nil {
                    return "Разрешение уже есть. Осталось дождаться device token от APNs."
                }
                return "Разрешение получено. Можно повторно отправить token на backend для этой сессии."
            }
        }
    }

    var canRequestAuthorization: Bool {
        isPushFeatureEnabled() && authorizationState == .notDetermined
    }

    var canRefreshRegistration: Bool {
        isPushFeatureEnabled() && authorizationState == .authorized
    }

    var canOpenSettings: Bool {
        authorizationState == .denied
    }

    var deviceTokenPreview: String? {
        guard let latestDeviceToken, latestDeviceToken.count > 16 else {
            return latestDeviceToken
        }

        let prefix = latestDeviceToken.prefix(8)
        let suffix = latestDeviceToken.suffix(8)
        return "\(prefix)...\(suffix)"
    }

    func configure(
        pushService: PushDeviceNetworking,
        isPushFeatureEnabled: @escaping @MainActor () -> Bool,
        isSessionAuthenticated: @escaping @MainActor () -> Bool,
        routeHandler: @escaping @MainActor (UUID?) -> Void,
        bundleIDProvider: @escaping @MainActor () -> String? = {
            Bundle.main.bundleIdentifier
        },
        environmentProvider: @escaping @MainActor () -> PushDeviceEnvironment = {
            #if DEBUG
            .sandbox
            #else
            .production
            #endif
        }
    ) {
        self.pushService = pushService
        self.isPushFeatureEnabled = isPushFeatureEnabled
        self.isSessionAuthenticated = isSessionAuthenticated
        self.routeHandler = routeHandler
        self.bundleIDProvider = bundleIDProvider
        self.environmentProvider = environmentProvider
        self.lastSyncedToken = nil
        installNotificationDelegate()
    }

    func installNotificationDelegate() {
        UNUserNotificationCenter.current().delegate = self
    }

    func requestAuthorizationAndRegister() async {
        guard isPushFeatureEnabled() else {
            lastErrorMessage = "Push-уведомления отключены конфигурацией приложения."
            return
        }

        installNotificationDelegate()
        await refreshAuthorizationState()

        if authorizationState == .authorized {
            await registerForRemoteNotifications()
            await syncCurrentTokenIfPossible(force: true)
            return
        }

        if authorizationState == .denied {
            lastErrorMessage = "Откройте системные настройки приложения и включите уведомления вручную."
            return
        }

        do {
            let center = UNUserNotificationCenter.current()
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            await refreshAuthorizationState()
            if granted {
                await registerForRemoteNotifications()
                await syncCurrentTokenIfPossible(force: true)
            }
        } catch {
            syncState = .failed
            lastErrorMessage = error.localizedDescription
            analytics.track(error: error, context: "push_authorization_request")
        }
    }

    func syncAuthorizedStateForCurrentSession() async {
        installNotificationDelegate()
        await refreshAuthorizationState()

        guard isPushFeatureEnabled(), authorizationState == .authorized else {
            return
        }

        await registerForRemoteNotifications()
        await syncCurrentTokenIfPossible(force: false)
    }

    func detachFromCurrentSession() async {
        guard let pushService else {
            lastSyncedToken = nil
            return
        }

        let token = lastSyncedToken ?? latestDeviceToken
        guard let token else {
            lastSyncedToken = nil
            syncState = .idle
            return
        }

        do {
            try await pushService.deleteDevice(token: token)
            lastSyncedToken = nil
            lastErrorMessage = nil
            syncState = .idle
        } catch {
            syncState = .failed
            lastErrorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "push_device_delete")
        }
    }

    func handleSessionEnded() {
        lastSyncedToken = nil
        if authorizationState != .authorized {
            syncState = .idle
        }
    }

    func didRegister(deviceToken: Data) {
#if DEBUG
        print("[Push] Failed to register for remote notifications: \(error.localizedDescription)")
#endif
        let normalizedToken = deviceToken
            .map { String(format: "%02x", $0) }
            .joined()

        latestDeviceToken = normalizedToken
        lastErrorMessage = nil
#if DEBUG
        print("[Push] Registered with APNs token: \(normalizedToken)")
#endif
        analytics.track(
            event: AppAnalyticsEvent(
                kind: .pushRegistered,
                metadata: [
                    "tokenLength": String(normalizedToken.count),
                ]
            )
        )

        Task {
            await syncCurrentTokenIfPossible(force: normalizedToken != lastSyncedToken)
        }
    }

    func didFailToRegister(error: Error) {
#if DEBUG
        print("[Push] Failed to register for remote notifications: \(error.localizedDescription)")
#endif
        syncState = .failed
        lastErrorMessage = error.localizedDescription
        analytics.track(error: error, context: "push_register")
    }

    func openApplicationSettings() {
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else {
            return
        }

        UIApplication.shared.open(settingsURL)
    }

    private func refreshAuthorizationState() async {
        let settings = await loadNotificationSettings()

        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            authorizationState = .authorized
        case .denied:
            authorizationState = .denied
        case .notDetermined:
            authorizationState = .notDetermined
        @unknown default:
            authorizationState = .unknown
        }
    }

    private func registerForRemoteNotifications() async {
        syncState = .registering
        UIApplication.shared.registerForRemoteNotifications()
    }

    private func syncCurrentTokenIfPossible(force: Bool) async {
        guard let pushService,
              isPushFeatureEnabled(),
              isSessionAuthenticated(),
              authorizationState == .authorized,
              let latestDeviceToken else {
            return
        }

        if !force, lastSyncedToken == latestDeviceToken {
            if syncState != .synced {
                syncState = .synced
            }
            return
        }

        syncState = .registering

        do {
            try await pushService.registerDevice(
                token: latestDeviceToken,
                environment: environmentProvider(),
                bundleId: bundleIDProvider()
            )
            lastSyncedToken = latestDeviceToken
            lastErrorMessage = nil
            syncState = .synced
        } catch {
            syncState = .failed
            lastErrorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "push_device_register")
        }
    }

    private func loadNotificationSettings() async -> UNNotificationSettings {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                continuation.resume(returning: settings)
            }
        }
    }

    nonisolated private static func chatID(from userInfo: [AnyHashable: Any]) -> UUID? {
        guard let rawChatID = userInfo["chatId"] as? String else {
            return nil
        }

        return UUID(uuidString: rawChatID)
    }

    nonisolated func handleRemoteNotification(
        userInfo: [AnyHashable: Any],
        completion: (() -> Void)? = nil
    ) {
        let chatID = Self.chatID(from: userInfo)
        Task { @MainActor [weak self] in
            self?.routeHandler(chatID)
            completion?()
        }
    }
}

extension PushNotificationManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let chatID = Self.chatID(from: response.notification.request.content.userInfo)
        Task { @MainActor [weak self] in
            self?.routeHandler(chatID)
            completionHandler()
        }
    }
}

