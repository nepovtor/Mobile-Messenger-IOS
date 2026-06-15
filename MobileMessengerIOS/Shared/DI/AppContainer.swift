import Foundation
import Combine
import SwiftUI

@MainActor
public final class AppContainer: ObservableObject {
    private struct BackendHealthCheckResponse: Decodable {
        let status: String
        let uptime: TimeInterval?
        let timestamp: String?
    }

    private struct BackendVersionResponse: Decodable {
        let name: String
        let version: String
    }

    public enum AppearanceMode: String, CaseIterable, Identifiable {
        case system
        case light
        case dark

        public var id: String { rawValue }

        public var title: String {
            switch self {
            case .system:
                return "Системная"
            case .light:
                return "Светлая"
            case .dark:
                return "Тёмная"
            }
        }

        public var systemImage: String {
            switch self {
            case .system:
                return "gearshape.2.fill"
            case .light:
                return "sun.max.fill"
            case .dark:
                return "moon.fill"
            }
        }

        public var colorScheme: ColorScheme? {
            switch self {
            case .system:
                return nil
            case .light:
                return .light
            case .dark:
                return .dark
            }
        }
    }

    public enum ConnectionStatus: Equatable {
        case offline
        case connecting
        case reconnecting
        case online

        public var title: String {
            switch self {
            case .offline:
                return "Оффлайн"
            case .connecting:
                return "Подключение"
            case .reconnecting:
                return "Переподключаемся"
            case .online:
                return "Онлайн"
            }
        }

        public var subtitle: String {
            switch self {
            case .offline:
                return "Показываем сохраненные данные"
            case .connecting:
                return "Поднимаем соединение"
            case .reconnecting:
                return "Восстанавливаем realtime и синхронизацию"
            case .online:
                return "Синхронизация работает"
            }
        }

        public var systemImage: String {
            switch self {
            case .offline:
                return "wifi.slash"
            case .connecting:
                return "antenna.radiowaves.left.and.right"
            case .reconnecting:
                return "arrow.triangle.2.circlepath"
            case .online:
                return "checkmark.circle.fill"
            }
        }
    }

    public enum MainTab: Hashable {
        case contacts
        case map
        case chats
        case profile
    }

    public static let shared = AppContainer()
    private enum DefaultsKeys {
        static let appearanceMode = "ui.appearance_mode"
        static let highContrastDarkMode = "ui.high_contrast_dark_mode"
        static let showPhoneNumberInProfile = "profile.show_phone_number"
        static let showTechnicalDetailsInProfile = "profile.show_technical_details"
    }

    private let configService: DefaultConfigService
    public let sessionStore: SessionStore
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager
    private let reachability: ReachabilityService
    private let authTokenProvider: @Sendable () async -> String?
    private let chatStore: ChatLocalStore
    private var chatRepository: ChatRepository!
    private var chatService: ChatNetworking!
    private var contactsService: ContactsNetworking!
    private var profileService: ProfileNetworking!
    private var locationService: LocationNetworking!
    private var pushService: PushDeviceNetworking!
    private var contactsRepository: ContactsRepository!
    private var profileRepository: ProfileRepository!
    private var locationRepository: LocationRepository!
    private var realtimeService: ChatRealtimeService!
    private var sessionStateCancellable: AnyCancellable?
    private var connectionStateTask: Task<Void, Never>?
    private var isSceneActive = false
    private var latestRealtimeState: ChatRealtimeConnectionState = .disconnected
    private var lastAuthenticatedUserID: UUID?
    private let defaults: UserDefaults
    @Published public private(set) var connectionStatus: ConnectionStatus = .offline
    @Published public private(set) var realtimeConnectionState: ChatRealtimeConnectionState = .disconnected
    @Published public private(set) var appearanceMode: AppearanceMode
    @Published public private(set) var highContrastDarkMode: Bool
    @Published public private(set) var showPhoneNumberInProfile: Bool
    @Published public private(set) var showTechnicalDetailsInProfile: Bool
    @Published public var selectedTab: MainTab = .contacts
    @Published public private(set) var pendingPushChatID: UUID?

    @Published public private(set) var configurationRevision: Int = 0

    private init() {
        let tokenStore = KeychainTokenStore()
        defaults = .standard
        appearanceMode = AppearanceMode(
            rawValue: defaults.string(forKey: DefaultsKeys.appearanceMode) ?? ""
        ) ?? .system
        highContrastDarkMode = defaults.object(forKey: DefaultsKeys.highContrastDarkMode) as? Bool ?? true
        showPhoneNumberInProfile = defaults.object(forKey: DefaultsKeys.showPhoneNumberInProfile) as? Bool ?? true
        showTechnicalDetailsInProfile =
            defaults.object(forKey: DefaultsKeys.showTechnicalDetailsInProfile) as? Bool ??
            Self.defaultShowTechnicalDetailsInProfile

        configService = DefaultConfigService()
        analytics = DefaultAnalyticsService.shared
        reachability = DefaultReachabilityService()

        // Initialize main-actor isolated components safely
        sessionStore = SessionStore(tokenStore: tokenStore)
        authTokenProvider = { [sessionStore] in
            await MainActor.run { sessionStore.authToken }
        }

        chatStore = SwiftDataChatStore()
        notificationManager = PushNotificationManager.shared
        configureNetworkingServices()
        bindSessionState()
        bindConnectionState()
        runDebugBackendHealthCheck()
    }

    public func updateAppearanceMode(_ mode: AppearanceMode) {
        appearanceMode = mode
        defaults.set(mode.rawValue, forKey: DefaultsKeys.appearanceMode)
    }

    public func updateHighContrastDarkMode(_ isEnabled: Bool) {
        highContrastDarkMode = isEnabled
        defaults.set(isEnabled, forKey: DefaultsKeys.highContrastDarkMode)
    }

    public func updateShowPhoneNumberInProfile(_ isEnabled: Bool) {
        showPhoneNumberInProfile = isEnabled
        defaults.set(isEnabled, forKey: DefaultsKeys.showPhoneNumberInProfile)
    }

    public func updateShowTechnicalDetailsInProfile(_ isEnabled: Bool) {
        showTechnicalDetailsInProfile = isEnabled
        defaults.set(isEnabled, forKey: DefaultsKeys.showTechnicalDetailsInProfile)
    }

    public var restBaseURLString: String {
        configService.restBaseURL.absoluteString
    }

    public var defaultRESTBaseURLString: String {
        configService.defaultRESTBaseURL.absoluteString
    }

    public var isUsingCustomRESTBaseURL: Bool {
        configService.hasCustomRESTBaseURL
    }

    public var isPushFeatureEnabled: Bool {
        configService.features.isPushEnabled
    }

    var profileEnvironmentInfo: ProfileEnvironmentInfo {
        let host = configService.restBaseURL.host?.lowercased() ?? ""

        if host == "localhost" || host == "127.0.0.1" {
            return ProfileEnvironmentInfo(
                badgeTitle: "Local backend",
                title: "Local environment",
                detail: "Connected to a localhost backend configuration."
            )
        }

        if configService.hasCustomRESTBaseURL {
            return ProfileEnvironmentInfo(
                badgeTitle: "Custom backend",
                title: "Custom environment",
                detail: "Using a custom backend selected in app configuration."
            )
        }

        return ProfileEnvironmentInfo(
            badgeTitle: "Configured backend",
            title: "Default environment",
            detail: "Using the default backend bundled with the app."
        )
    }

    public func updateRESTBaseURL(_ rawValue: String) throws {
        try configService.updateRESTBaseURL(rawValue)
        applyConfigurationChange()
    }

    public func resetRESTBaseURL() {
        configService.resetRESTBaseURL()
        applyConfigurationChange()
    }

    /// Creates and returns a new ChatViewModel for the given chat ID and title.
    public func makeChatViewModel(chatID: UUID, title: String) -> ChatViewModel {
        ChatViewModel(
            chatID: chatID,
            title: title,
            observeMessages: ObserveChatMessagesUseCase(repository: chatRepository),
            loadHistory: LoadChatHistoryUseCase(repository: chatRepository),
            sendMessage: SendMessageUseCase(repository: chatRepository),
            sendImageMessage: SendImageMessageUseCase(repository: chatRepository),
            editMessage: EditMessageUseCase(repository: chatRepository),
            deleteMessage: DeleteMessageUseCase(repository: chatRepository),
            setTyping: SetTypingUseCase(repository: chatRepository),
            retryPending: RetryPendingMessagesUseCase(repository: chatRepository),
            markStatus: MarkMessageStatusUseCase(repository: chatRepository),
            analytics: analytics,
            reachability: reachability
        )
    }

    /// Creates and returns a new ChatListViewModel.
    public func makeChatListViewModel() -> ChatListViewModel {
        ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: chatRepository),
            observeChats: ObserveChatListUseCase(repository: chatRepository),
            createChat: CreateChatUseCase(repository: chatRepository),
            deleteChat: DeleteChatUseCase(repository: chatRepository),
            contactsService: contactsService,
            analytics: analytics
        )
    }

    /// Creates and returns a new ContactsViewModel.
    func makeContactsViewModel() -> ContactsViewModel {
        ContactsViewModel(
            loadContacts: LoadContactsUseCase(repository: contactsRepository),
            addContact: AddContactUseCase(repository: contactsRepository),
            removeContact: RemoveContactUseCase(repository: contactsRepository),
            loadChats: LoadChatListUseCase(repository: chatRepository),
            createChat: CreateChatUseCase(repository: chatRepository),
            analytics: analytics
        )
    }

    /// Creates and returns a new ProfileViewModel.
    func makeProfileViewModel() -> ProfileViewModel {
        ProfileViewModel(
            fetchProfile: FetchProfileUseCase(repository: profileRepository),
            updateProfile: UpdateProfileUseCase(repository: profileRepository),
            updateDisplayNameAction: { [sessionStore] displayName in
                sessionStore.updateDisplayName(displayName)
            },
            logoutAction: { [weak self] in
                await self?.logout()
            }
        )
    }

    func makeMapViewModel() -> MapViewModel {
        MapViewModel(
            loadMyLocation: LoadMyLocationUseCase(repository: locationRepository),
            loadContactLocations: LoadContactLocationsUseCase(repository: locationRepository),
            updateMyLocation: UpdateMyLocationUseCase(repository: locationRepository),
            stopLocationSharing: StopLocationSharingUseCase(repository: locationRepository),
            createChat: CreateChatUseCase(repository: chatRepository),
            analytics: analytics
        )
    }

    /// Creates and returns a new AuthViewModel.
    public func makeAuthViewModel() -> AuthViewModel {
        AuthViewModel(
            authService: RESTAuthService(baseURL: configService.restBaseURL),
            sessionStore: sessionStore,
            telegramBotURL: configService.telegramBotURL,
            defaults: defaults
        )
    }

    private func configureNetworkingServices() {
        chatService = RESTChatService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider,
            unauthorizedHandler: { [weak self] in
                await self?.handleUnauthorizedSessionReset()
            }
        )
        contactsService = RESTContactsService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider,
            unauthorizedHandler: { [weak self] in
                await self?.handleUnauthorizedSessionReset()
            }
        )
        profileService = RESTProfileService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider,
            unauthorizedHandler: { [weak self] in
                await self?.handleUnauthorizedSessionReset()
            }
        )
        locationService = RESTLocationService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider,
            unauthorizedHandler: { [weak self] in
                await self?.handleUnauthorizedSessionReset()
            }
        )
        pushService = RESTPushDeviceService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider,
            unauthorizedHandler: { [weak self] in
                await self?.handleUnauthorizedSessionReset()
            }
        )
        contactsRepository = DefaultContactsRepository(service: contactsService)
        profileRepository = DefaultProfileRepository(service: profileService)
        locationRepository = DefaultLocationRepository(service: locationService)
        realtimeService = DefaultChatRealtimeService(
            websocketURL: configService.websocketURL,
            authTokenProvider: authTokenProvider,
            analytics: analytics,
            reachability: reachability,
            featureFlags: configService.features
        )
        chatRepository = DefaultChatRepository(
            store: chatStore,
            remote: chatService,
            realtime: realtimeService,
            analytics: analytics,
            reachability: reachability
        )
        notificationManager.configure(
            pushService: pushService,
            isPushFeatureEnabled: { [weak self] in
                self?.isPushFeatureEnabled ?? false
            },
            isSessionAuthenticated: { [weak self] in
                self?.sessionStore.authToken != nil
            },
            routeHandler: { [weak self] chatID in
                self?.openChatFromPush(chatID: chatID)
            }
        )
    }

    private func applyConfigurationChange() {
        configureNetworkingServices()
        bindConnectionState()
        configurationRevision += 1
        runDebugBackendHealthCheck()
        if isSceneActive {
            Task { await refreshApplicationState() }
        }
    }

    private func runDebugBackendHealthCheck() {
        #if DEBUG
        guard configService.features.isLoggingVerbose else { return }
        let restBaseURL = configService.restBaseURL
        Task.detached(priority: .background) {
            do {
                let health: BackendHealthCheckResponse = try await Self.fetchDebugEndpoint(
                    "health",
                    from: restBaseURL
                )
                let version: BackendVersionResponse = try await Self.fetchDebugEndpoint(
                    "version",
                    from: restBaseURL
                )
                let uptimeDescription = health.uptime.map { String(format: "%.0f", $0) } ?? "n/a"
                let timestamp = health.timestamp ?? "n/a"
                let message = "[Backend] health=\(health.status) uptime=\(uptimeDescription)s version=\(version.name)@\(version.version) timestamp=\(timestamp)\n"
                if let data = message.data(using: .utf8) {
                    FileHandle.standardError.write(data)
                }
            } catch {
                let message = "[Backend] health check failed for \(restBaseURL.absoluteString): \(AppError.presentableMessage(for: error))\n"
                if let data = message.data(using: .utf8) {
                    FileHandle.standardError.write(data)
                }
            }
        }
        #endif
    }

    private static func fetchDebugEndpoint<Response: Decodable>(
        _ path: String,
        from baseURL: URL
    ) async throws -> Response {
        let request = URLRequest(url: baseURL.appendingAPIPath(path))
        return try await APIResponseParser.requestJSON(request, using: .shared)
    }

    public func handleScenePhase(_ scenePhase: ScenePhase) {
        switch scenePhase {
        case .active:
            isSceneActive = true
            Task { await refreshApplicationState() }
        case .inactive, .background:
            isSceneActive = false
            realtimeService.deactivate()
            updateConnectionStatus()
        @unknown default:
            break
        }
    }

    private func bindSessionState() {
        sessionStateCancellable = sessionStore.$state.sink { [weak self] state in
            guard let self else { return }
            switch state {
            case .authenticated(_, let userID, _):
                let previousUserID = self.lastAuthenticatedUserID
                self.lastAuthenticatedUserID = userID
                Task {
                    if previousUserID != nil, previousUserID != userID {
                        self.realtimeService.handleLogout()
                        await self.chatRepository?.resetLocalState()
                    }

                    await self.notificationManager.syncAuthorizedStateForCurrentSession()
                    if self.isSceneActive {
                        await self.refreshApplicationState()
                    }
                }
            case .unauthenticated:
                self.lastAuthenticatedUserID = nil
                realtimeService?.handleLogout()
                notificationManager.handleSessionEnded()
                pendingPushChatID = nil
                selectedTab = .contacts
                Task { await self.chatRepository?.resetLocalState() }
                connectionStatus = .offline
            }
        }
    }

    private func bindConnectionState() {
        connectionStateTask?.cancel()
        connectionStateTask = Task { [weak self] in
            guard let self else { return }
            for await state in realtimeService.observeConnectionState() {
                await MainActor.run {
                    self.latestRealtimeState = state
                    self.realtimeConnectionState = state
                    self.updateConnectionStatus()
                }
            }
        }
        updateConnectionStatus()
    }

    private func refreshApplicationState() async {
        guard sessionStore.authToken != nil else {
            realtimeService.deactivate()
            connectionStatus = .offline
            return
        }
        await notificationManager.syncAuthorizedStateForCurrentSession()
        realtimeService.activate()
        updateConnectionStatus()
        await chatRepository.refreshForForeground()
    }

    public func logout() async {
        await notificationManager.detachFromCurrentSession()
        sessionStore.logout()
    }

    public func openChatFromPush(chatID: UUID?) {
        selectedTab = .chats
        pendingPushChatID = chatID
    }

    public func consumePendingPushChatNavigation(for chatID: UUID) {
        guard pendingPushChatID == chatID else { return }
        pendingPushChatID = nil
    }

    public func clearPendingPushChatNavigation() {
        pendingPushChatID = nil
    }

    private func handleUnauthorizedSessionReset() async {
        await MainActor.run {
            notificationManager.handleSessionEnded()
            sessionStore.logout()
        }
    }

    private func updateConnectionStatus() {
        guard sessionStore.authToken != nil else {
            connectionStatus = .offline
            return
        }
        guard isSceneActive else {
            connectionStatus = reachability.isReachable ? .reconnecting : .offline
            return
        }
        guard reachability.isReachable else {
            connectionStatus = .offline
            return
        }
        switch latestRealtimeState {
        case .connected:
            connectionStatus = .online
        case .connecting:
            connectionStatus = .connecting
        case .reconnecting, .disconnected:
            connectionStatus = .reconnecting
        case .failed:
            connectionStatus = .offline
        }
    }

    private static var defaultShowTechnicalDetailsInProfile: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
}
