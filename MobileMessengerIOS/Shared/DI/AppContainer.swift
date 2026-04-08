import Foundation

@MainActor
public final class AppContainer: ObservableObject {
    @MainActor public static let shared = AppContainer()

    public let configService: ConfigService
    public let sessionStore: SessionStore
    public let analytics: AnalyticsService
    public let reachability: ReachabilityService
    public let chatRepository: ChatRepository

    private let realtimeService: ChatRealtimeService
    private let chatStore: ChatLocalStore
    private let notificationManager: PushNotificationManager

    @MainActor
    private init() {
        let tokenStore: TokenStore = KeychainTokenStore()

        configService = DefaultConfigService()
        analytics = DefaultAnalyticsService.shared
        reachability = DefaultReachabilityService()
        sessionStore = SessionStore(tokenStore: tokenStore)
        notificationManager = .shared

        chatStore = SwiftDataChatStore()
        realtimeService = DefaultChatRealtimeService(
            baseURL: configService.websocketURL,
            analytics: analytics,
            reachability: reachability,
            featureFlags: configService.features,
            userSessionProvider: { tokenStore.retrieveSession() }
        )

        let chatNetworking = RESTChatService(
            baseURL: configService.restBaseURL,
            tokenProvider: { tokenStore.retrieveSession()?.token }
        )
        chatRepository = DefaultChatRepository(
            store: chatStore,
            realtime: realtimeService,
            analytics: analytics,
            userSessionProvider: { tokenStore.retrieveSession() },
            chatNetworking: chatNetworking
        )
    }

    public func makeChatViewModel(chatID: UUID, title: String) -> ChatViewModel {
        ChatViewModel(
            chatID: chatID,
            title: title,
            observeMessages: ObserveChatMessagesUseCase(repository: chatRepository),
            loadHistory: LoadChatHistoryUseCase(repository: chatRepository),
            loadChatState: { [chatRepository] chatID in
                try await chatRepository.getChat(chatID)
            },
            sendMessage: SendMessageUseCase(repository: chatRepository),
            retryPending: RetryPendingMessagesUseCase(repository: chatRepository),
            markStatus: MarkMessageStatusUseCase(repository: chatRepository),
            setTypingState: { [chatRepository] chatID, isTyping in
                await chatRepository.setTyping(in: chatID, isTyping: isTyping)
            },
            analytics: analytics,
            notificationManager: notificationManager,
            reachability: reachability
        )
    }

    public func makeChatListViewModel() -> ChatListViewModel {
        ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: chatRepository),
            createChat: CreateChatUseCase(repository: chatRepository),
            analytics: analytics
        )
    }

    public func makeAuthViewModel() -> AuthViewModel {
        AuthViewModel(authService: RESTAuthService(baseURL: configService.restBaseURL), sessionStore: sessionStore)
    }
}
