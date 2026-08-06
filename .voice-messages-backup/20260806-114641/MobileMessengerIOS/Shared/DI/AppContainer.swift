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

    public typealias AppearanceMode = AppSettingsStore.AppearanceMode
    public typealias ConnectionStatus = ConnectionCoordinator.Status
    public typealias MainTab = AppRouter.MainTab

    public static let shared = AppContainer()

    private let configService: DefaultConfigService
    public let sessionStore: SessionStore
    public let router: AppRouter
    public let settings: AppSettingsStore
    public let connectionCoordinator: ConnectionCoordinator
    private let sessionCoordinator: AppSessionCoordinator
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager
    private let reachability: ReachabilityService
    private lazy var authTokenProvider: @Sendable () async -> String? = { [weak self] in
        await self?.validAuthToken()
    }
    private var refreshTask: Task<AuthVerifyResponse, Error>?
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
    private let defaults: UserDefaults
    private var childStateCancellables: Set<AnyCancellable> = []

    public var connectionStatus: ConnectionStatus { connectionCoordinator.status }
    public var realtimeConnectionState: ChatRealtimeConnectionState { connectionCoordinator.realtimeState }
    public var appearanceMode: AppearanceMode { settings.appearanceMode }
    public var highContrastDarkMode: Bool { settings.highContrastDarkMode }
    public var showPhoneNumberInProfile: Bool { settings.showPhoneNumberInProfile }
    public var showTechnicalDetailsInProfile: Bool { settings.showTechnicalDetailsInProfile }
    public var selectedTab: MainTab {
        get { router.selectedTab }
        set { router.selectedTab = newValue }
    }
    public var pendingPushChatID: UUID? { router.pendingPushChatID }

    @Published public private(set) var configurationRevision: Int = 0

    private init() {
        let tokenStore = KeychainTokenStore()
        defaults = .standard
        configService = DefaultConfigService()
        analytics = DefaultAnalyticsService.shared
        reachability = DefaultReachabilityService()

        // Initialize main-actor isolated components safely
        sessionStore = SessionStore(tokenStore: tokenStore)
        router = AppRouter()
        settings = AppSettingsStore(defaults: defaults)
        connectionCoordinator = ConnectionCoordinator(sessionStore: sessionStore, reachability: reachability)
        sessionCoordinator = AppSessionCoordinator(
            sessionStore: sessionStore,
            router: router,
            connectionCoordinator: connectionCoordinator
        )
        chatStore = SwiftDataChatStore()
        notificationManager = PushNotificationManager.shared
        configureNetworkingServices()
        configureCoordinators()
        bindChildState()
        runDebugBackendHealthCheck()
    }

    public func updateAppearanceMode(_ mode: AppearanceMode) {
        settings.updateAppearanceMode(mode)
    }

    public func updateHighContrastDarkMode(_ isEnabled: Bool) {
        settings.updateHighContrastDarkMode(isEnabled)
    }

    public func updateShowPhoneNumberInProfile(_ isEnabled: Bool) {
        settings.updateShowPhoneNumberInProfile(isEnabled)
    }

    public func updateShowTechnicalDetailsInProfile(_ isEnabled: Bool) {
        settings.updateShowTechnicalDetailsInProfile(isEnabled)
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
                badgeTitle: "Локальный сервер",
                title: "Локальная среда",
                detail: "Подключено к серверу, запущенному на этом компьютере."
            )
        }

        if configService.hasCustomRESTBaseURL {
            return ProfileEnvironmentInfo(
                badgeTitle: "Свой сервер",
                title: "Настроенная среда",
                detail: "Используется сервер, выбранный в настройках приложения."
            )
        }

        return ProfileEnvironmentInfo(
            badgeTitle: "Основной сервер",
            title: "Рабочая среда",
            detail: "Используется сервер приложения по умолчанию."
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
            loadSharingPermissions: LoadLocationSharingPermissionsUseCase(repository: locationRepository),
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
                self?.router.openChatFromPush(chatID: chatID)
            }
        )
    }

    private func configureCoordinators() {
        connectionCoordinator.configure(
            realtimeService: realtimeService,
            foregroundRefresh: { [weak self] in
                guard let self, self.sessionStore.authToken != nil else { return }
                await self.notificationManager.syncAuthorizedStateForCurrentSession()
                self.realtimeService.activate()
                await self.chatRepository.refreshForForeground()
            }
        )
        sessionCoordinator.configure(
            realtimeService: realtimeService,
            resetLocalState: { [weak self] in
                await self?.chatRepository?.resetLocalState()
            },
            syncNotifications: { [weak self] in
                await self?.notificationManager.syncAuthorizedStateForCurrentSession()
            },
            sessionEnded: { [weak self] in
                self?.notificationManager.handleSessionEnded()
            },
            detachNotifications: { [weak self] in
                await self?.notificationManager.detachFromCurrentSession()
            }
        )
    }

    private func bindChildState() {
        settings.objectWillChange
            .merge(with: router.objectWillChange, connectionCoordinator.objectWillChange)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &childStateCancellables)
    }

    private func applyConfigurationChange() {
        configureNetworkingServices()
        configureCoordinators()
        configurationRevision += 1
        runDebugBackendHealthCheck()
        if connectionCoordinator.isSceneActive {
            Task { await connectionCoordinator.refresh() }
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
                let message = "[Backend] health check failed.\n"
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
        connectionCoordinator.handleScenePhase(scenePhase)
    }

    public func logout() async {
        let refreshToken = sessionStore.authRefreshToken
        let baseURL = configService.restBaseURL
        await sessionCoordinator.logout {
            if let refreshToken {
                try? await RESTAuthService(baseURL: baseURL)
                    .logout(refreshToken: refreshToken)
            }
        }
    }

    public func openChatFromPush(chatID: UUID?) {
        router.openChatFromPush(chatID: chatID)
    }

    public func consumePendingPushChatNavigation(for chatID: UUID) {
        router.consumePendingPushChatNavigation(for: chatID)
    }

    public func clearPendingPushChatNavigation() {
        router.clearPendingPushChatNavigation()
    }

    private func handleUnauthorizedSessionReset() async {
        sessionCoordinator.handleUnauthorized()
    }

    private func validAuthToken() async -> String? {
        guard let accessToken = sessionStore.authToken else {
            return nil
        }
        guard Self.jwtNeedsRefresh(accessToken) else {
            return accessToken
        }
        guard let refreshToken = sessionStore.authRefreshToken else {
            sessionCoordinator.handleUnauthorized()
            return nil
        }

        let task: Task<AuthVerifyResponse, Error>
        if let refreshTask {
            task = refreshTask
        } else {
            let service = RESTAuthService(baseURL: configService.restBaseURL)
            let newTask = Task {
                try await service.refresh(refreshToken: refreshToken)
            }
            refreshTask = newTask
            task = newTask
        }

        do {
            let response = try await task.value
            refreshTask = nil
            sessionStore.updateCredentials(
                accessToken: response.token,
                refreshToken: response.refreshToken
            )
            return response.token
        } catch {
            refreshTask = nil
            if let expiration = Self.jwtExpiration(accessToken),
               expiration > Date() {
                return accessToken
            }
            sessionCoordinator.handleUnauthorized()
            return nil
        }
    }

    private static func jwtNeedsRefresh(_ token: String) -> Bool {
        guard let expiration = jwtExpiration(token) else {
            return true
        }
        return expiration.timeIntervalSinceNow <= 60
    }

    private static func jwtExpiration(_ token: String) -> Date? {
        let components = token.split(separator: ".")
        guard components.count == 3 else { return nil }
        var encodedPayload = String(components[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = encodedPayload.count % 4
        if remainder != 0 {
            encodedPayload.append(String(repeating: "=", count: 4 - remainder))
        }
        guard let data = Data(base64Encoded: encodedPayload),
              let object = try? JSONSerialization.jsonObject(with: data),
              let payload = object as? [String: Any],
              let expiration = payload["exp"] as? TimeInterval else {
            return nil
        }
        return Date(timeIntervalSince1970: expiration)
    }
}
