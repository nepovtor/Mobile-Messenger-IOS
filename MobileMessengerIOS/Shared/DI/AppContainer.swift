import Foundation
import Combine

@MainActor
public final class AppContainer: ObservableObject {
    public static let shared = AppContainer()

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
    private var realtimeService: ChatRealtimeService!

    @Published public private(set) var configurationRevision: Int = 0

    private init() {
        #if DEBUG
        let tokenStore = InMemoryTokenStore()
        #else
        let tokenStore = KeychainTokenStore()
        #endif

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
            setTyping: SetTypingUseCase(repository: chatRepository),
            retryPending: RetryPendingMessagesUseCase(repository: chatRepository),
            markStatus: MarkMessageStatusUseCase(repository: chatRepository),
            analytics: analytics,
            notificationManager: notificationManager,
            reachability: reachability
        )
    }

    /// Creates and returns a new ChatListViewModel.
    public func makeChatListViewModel() -> ChatListViewModel {
        ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: chatRepository),
            createChat: CreateChatUseCase(repository: chatRepository),
            contactsService: contactsService,
            analytics: analytics
        )
    }

    /// Creates and returns a new ContactsViewModel.
    func makeContactsViewModel() -> ContactsViewModel {
        ContactsViewModel(
            contactsService: contactsService,
            createChat: CreateChatUseCase(repository: chatRepository),
            analytics: analytics
        )
    }

    /// Creates and returns a new ProfileViewModel.
    func makeProfileViewModel() -> ProfileViewModel {
        ProfileViewModel(contactsService: contactsService)
    }

    /// Creates and returns a new AuthViewModel.
    public func makeAuthViewModel() -> AuthViewModel {
        AuthViewModel(authService: RESTAuthService(baseURL: configService.restBaseURL), sessionStore: sessionStore)
    }

    private func configureNetworkingServices() {
        chatService = RESTChatService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider
        )
        contactsService = RESTContactsService(
            baseURL: configService.restBaseURL,
            authTokenProvider: authTokenProvider
        )
        realtimeService = DefaultChatRealtimeService(
            baseURL: configService.restBaseURL,
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
    }

    private func applyConfigurationChange() {
        configureNetworkingServices()
        sessionStore.logout()
        configurationRevision += 1
    }
}
