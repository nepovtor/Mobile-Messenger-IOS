import Foundation

@MainActor
public final class AppContainer: ObservableObject {
    public static let shared = AppContainer()

    private let configService: ConfigService
    private let sessionStore: SessionStore
    private let analytics: AnalyticsService
    private let reachability: ReachabilityService
    private let chatRepository: ChatRepository

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
        sessionStore = SessionStore(tokenStore: tokenStore)

        chatStore = SwiftDataChatStore()
        realtimeService = DefaultChatRealtimeService(
            baseURL: configService.websocketURL,
            analytics: analytics,
            reachability: reachability,
            featureFlags: configService.features
        )

        chatRepository = DefaultChatRepository(
            store: chatStore,
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
            retryPending: RetryPendingMessagesUseCase(repository: chatRepository),
            markStatus: MarkMessageStatusUseCase(repository: chatRepository),
            analytics: analytics
        )
    }

    /// Creates and returns a new ChatListViewModel.
    public func makeChatListViewModel() -> ChatListViewModel {
        ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: chatRepository),
            analytics: analytics
        )
    }

    /// Creates and returns a new AuthViewModel.
    public func makeAuthViewModel() -> AuthViewModel {
        AuthViewModel(authService: RESTAuthService(baseURL: configService.restBaseURL), sessionStore: sessionStore)
    }
}
