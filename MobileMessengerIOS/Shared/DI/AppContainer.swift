import Foundation
import Combine
import SwiftUI

@MainActor
public final class AppContainer: ObservableObject {
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

    public static let shared = AppContainer()

    private let configService: DefaultConfigService
    public let sessionStore: SessionStore
    private let analytics: AnalyticsService
    private let notificationManager: PushNotificationManager
    private let reachability: ReachabilityService
    private let chatPresentationStore: ChatPresentationStore
    private let authTokenProvider: @Sendable () async -> String?
    private let chatStore: ChatLocalStore
    private var chatRepository: ChatRepository!
    private var chatService: ChatNetworking!
    private var contactsService: ContactsNetworking!
    private var realtimeService: ChatRealtimeService!
    private var sessionStateCancellable: AnyCancellable?
    private var connectionStateTask: Task<Void, Never>?
    private var isSceneActive = false
    private var latestRealtimeState: ChatRealtimeConnectionState = .disconnected
    @Published public private(set) var connectionStatus: ConnectionStatus = .offline

    @Published public private(set) var configurationRevision: Int = 0

    private init() {
        let tokenStore = KeychainTokenStore()

        configService = DefaultConfigService()
        analytics = DefaultAnalyticsService.shared
        reachability = DefaultReachabilityService()
        chatPresentationStore = ChatPresentationStore()

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
            reachability: reachability,
            presentationStore: chatPresentationStore
        )
    }

    /// Creates and returns a new ChatListViewModel.
    public func makeChatListViewModel() -> ChatListViewModel {
        ChatListViewModel(
            loadChats: LoadChatListUseCase(repository: chatRepository),
            observeChats: ObserveChatListUseCase(repository: chatRepository),
            createChat: CreateChatUseCase(repository: chatRepository),
            contactsService: contactsService,
            analytics: analytics,
            presentationStore: chatPresentationStore
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
        bindConnectionState()
        configurationRevision += 1
        if isSceneActive {
            Task { await refreshApplicationState() }
        }
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
            case .authenticated:
                if isSceneActive {
                    Task { await self.refreshApplicationState() }
                }
            case .unauthenticated:
                realtimeService?.handleLogout()
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
        realtimeService.activate()
        updateConnectionStatus()
        await chatRepository.refreshForForeground()
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
            connectionStatus = .reconnecting
        }
    }
}

@MainActor
public final class ChatPresentationStore: ObservableObject {
    public struct ChatState: Equatable, Sendable {
        public let isPinned: Bool
        public let isMuted: Bool
        public let isArchived: Bool
        public let draft: String
    }

    private struct PersistedState: Codable {
        var pinnedChatIDs: [UUID] = []
        var mutedChatIDs: [UUID] = []
        var archivedChatIDs: [UUID] = []
        var drafts: [String: String] = [:]
    }

    @Published public private(set) var revision: Int = 0

    private let defaults: UserDefaults
    private let storageKey = "chat_presentation_state"
    private var state: PersistedState

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(PersistedState.self, from: data) {
            self.state = decoded
        } else {
            self.state = PersistedState()
        }
    }

    public func state(for chatID: UUID) -> ChatState {
        ChatState(
            isPinned: state.pinnedChatIDs.contains(chatID),
            isMuted: state.mutedChatIDs.contains(chatID),
            isArchived: state.archivedChatIDs.contains(chatID),
            draft: state.drafts[chatID.uuidString] ?? ""
        )
    }

    public func setPinned(_ isPinned: Bool, for chatID: UUID) {
        update(&state.pinnedChatIDs, contains: isPinned, chatID: chatID)
        persist()
    }

    public func setMuted(_ isMuted: Bool, for chatID: UUID) {
        update(&state.mutedChatIDs, contains: isMuted, chatID: chatID)
        persist()
    }

    public func setArchived(_ isArchived: Bool, for chatID: UUID) {
        update(&state.archivedChatIDs, contains: isArchived, chatID: chatID)
        persist()
    }

    public func updateDraft(_ draft: String, for chatID: UUID) {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            state.drafts.removeValue(forKey: chatID.uuidString)
        } else {
            state.drafts[chatID.uuidString] = draft
        }
        persist()
    }

    private func update(_ ids: inout [UUID], contains shouldContain: Bool, chatID: UUID) {
        ids.removeAll { $0 == chatID }
        if shouldContain {
            ids.append(chatID)
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: storageKey)
        }
        revision += 1
    }
}
