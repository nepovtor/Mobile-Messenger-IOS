import Foundation

@MainActor
public final class AppContainer: ObservableObject {
    public static let shared = AppContainer()

    private let configService: ConfigService
    public let sessionStore: SessionStore
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager
    private let reachability: ReachabilityService
    private let chatRepository: ChatRepository
    private let chatService: ChatNetworking
    private let contactsService: ContactsNetworking

    private let realtimeService: ChatRealtimeService
    private let chatStore: ChatLocalStore

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
        let tokenProvider: @Sendable () async -> String? = { [sessionStore] in
            await MainActor.run { sessionStore.authToken }
        }

        chatStore = SwiftDataChatStore()
        chatService = RESTChatService(
            baseURL: configService.restBaseURL,
            authTokenProvider: tokenProvider
        )
        contactsService = RESTContactsService(
            baseURL: configService.restBaseURL,
            authTokenProvider: tokenProvider
        )
        realtimeService = DefaultChatRealtimeService(
            baseURL: configService.restBaseURL,
            authTokenProvider: tokenProvider,
            analytics: analytics,
            reachability: reachability,
            featureFlags: configService.features
        )

        notificationManager = PushNotificationManager.shared

        chatRepository = DefaultChatRepository(
            store: chatStore,
            remote: chatService,
            realtime: realtimeService,
            analytics: analytics
        )
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
            notificationManager: notificationManager
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
}
