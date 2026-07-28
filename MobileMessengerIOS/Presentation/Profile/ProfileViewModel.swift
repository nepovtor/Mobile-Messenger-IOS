import Foundation

struct ProfileEnvironmentInfo: Equatable {
    let badgeTitle: String
    let title: String
    let detail: String

    static let unknown = ProfileEnvironmentInfo(
        badgeTitle: "Приложение",
        title: "Среда подключения",
        detail: "Используется текущая настройка сервера приложения."
    )
}

enum ProfileRealtimeStatus: Equatable {
    case connected
    case connecting
    case reconnecting
    case disconnected
    case failed

    init(state: ChatRealtimeConnectionState) {
        switch state {
        case .connected:
            self = .connected
        case .connecting:
            self = .connecting
        case .reconnecting:
            self = .reconnecting
        case .disconnected:
            self = .disconnected
        case .failed:
            self = .failed
        }
    }

    var title: String {
        switch self {
        case .connected:
            return "Подключено"
        case .connecting:
            return "Подключение"
        case .reconnecting:
            return "Переподключение"
        case .disconnected:
            return "Нет подключения"
        case .failed:
            return "Проблема соединения"
        }
    }

    var detail: String {
        switch self {
        case .connected:
            return "Сообщения доставляются в реальном времени."
        case .connecting:
            return "Устанавливаем защищённое соединение."
        case .reconnecting:
            return "Восстанавливаем обновления чатов."
        case .disconnected:
            return "Обновления в реальном времени сейчас недоступны."
        case .failed:
            return "Приложение подключится снова при первой возможности."
        }
    }
}

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var displayName = "Неизвестный пользователь"
    @Published private(set) var phone = "Номер недоступен"
    @Published private(set) var userIDText = "ID пользователя недоступен"
    @Published private(set) var userIDFootnote: String?
    @Published private(set) var initials = "?"
    @Published private(set) var accountBadgeTitle = "Данные аккаунта"
    @Published private(set) var accountBadgeDetail = "Данные текущего пользователя"
    @Published private(set) var realtimeStatus: ProfileRealtimeStatus = .disconnected
    @Published private(set) var environmentInfo: ProfileEnvironmentInfo = .unknown
    @Published private(set) var isLoadingProfile = false
    @Published private(set) var hasStoredToken = false
    @Published var editedDisplayName = ""
    @Published private(set) var isEditingDisplayName = false
    @Published private(set) var isSavingDisplayName = false
    @Published private(set) var inlineMessage: String?
    @Published private(set) var didSaveDisplayName = false

    private let fetchProfileUseCase: FetchProfileUseCase
    private let updateProfileUseCase: UpdateProfileUseCase
    private let updateDisplayNameAction: @MainActor (String) -> Void
    private let logoutAction: @MainActor () async -> Void
    private var currentUserID: UUID?
    private var lastLoadedUserID: UUID?

    init(
        fetchProfile: FetchProfileUseCase,
        updateProfile: UpdateProfileUseCase,
        updateDisplayNameAction: @escaping @MainActor (String) -> Void,
        logoutAction: @escaping @MainActor () async -> Void
    ) {
        self.fetchProfileUseCase = fetchProfile
        self.updateProfileUseCase = updateProfile
        self.updateDisplayNameAction = updateDisplayNameAction
        self.logoutAction = logoutAction
    }

    func update(
        sessionState: SessionStore.State,
        realtimeState: ChatRealtimeConnectionState,
        environment: ProfileEnvironmentInfo
    ) {
        environmentInfo = environment
        realtimeStatus = ProfileRealtimeStatus(state: realtimeState)

        switch sessionState {
        case let .authenticated(token, userID, displayName):
            if currentUserID != userID {
                phone = "Номер недоступен"
                lastLoadedUserID = nil
            }
            currentUserID = userID
            self.displayName = displayName.isEmpty ? "Неизвестный пользователь" : displayName
            if !isEditingDisplayName {
                editedDisplayName = self.displayName
            }
            userIDText = userID.uuidString
            userIDFootnote = "ID пользователя"
            initials = Self.makeInitials(from: self.displayName)
            hasStoredToken = !token.isEmpty

            if Self.isDemoAccount(displayName: self.displayName) {
                accountBadgeTitle = "Демо-аккаунт"
                accountBadgeDetail = "Подходит для демонстрации чатов и сценариев приложения."
            } else {
                accountBadgeTitle = "Данные аккаунта"
                accountBadgeDetail = "Выполнен вход через текущую сессию сервера."
            }
        case .unauthenticated:
            currentUserID = nil
            displayName = "Неизвестный пользователь"
            userIDText = "ID пользователя недоступен"
            userIDFootnote = nil
            initials = "?"
            phone = "Номер недоступен"
            accountBadgeTitle = "Данные аккаунта"
            accountBadgeDetail = "Нет активной сессии аккаунта."
            hasStoredToken = false
            lastLoadedUserID = nil
            editedDisplayName = ""
            isEditingDisplayName = false
            inlineMessage = nil
            didSaveDisplayName = false
        }
    }

    func loadProfileIfNeeded() async {
        guard let userID = currentUserID, lastLoadedUserID != userID else { return }
        await refreshProfile()
    }

    func refreshProfile() async {
        guard let userID = currentUserID else {
            phone = "Номер недоступен"
            return
        }
        guard !isLoadingProfile else { return }

        isLoadingProfile = true
        defer { isLoadingProfile = false }

        do {
            let profile = try await fetchProfileUseCase()
            phone = Self.phoneText(from: profile.phone)
            displayName = profile.displayName.isEmpty ? displayName : profile.displayName
            initials = Self.makeInitials(from: displayName)
            lastLoadedUserID = userID
        } catch {
            phone = "Номер недоступен"
        }
    }

    func startEditingDisplayName() {
        editedDisplayName = displayName
        inlineMessage = nil
        didSaveDisplayName = false
        isEditingDisplayName = true
    }

    func cancelEditingDisplayName() {
        editedDisplayName = displayName
        inlineMessage = nil
        didSaveDisplayName = false
        isEditingDisplayName = false
    }

    func saveDisplayName() async {
        let trimmed = editedDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let validationMessage = Self.displayNameValidationMessage(for: trimmed) else {
            isSavingDisplayName = true
            defer { isSavingDisplayName = false }

            do {
                let profile = try await updateProfileUseCase(displayName: trimmed)
                displayName = profile.displayName
                editedDisplayName = profile.displayName
                phone = Self.phoneText(from: profile.phone)
                initials = Self.makeInitials(from: profile.displayName)
                lastLoadedUserID = currentUserID
                isEditingDisplayName = false
                didSaveDisplayName = true
                inlineMessage = "Имя обновлено."
                updateDisplayNameAction(profile.displayName)
            } catch {
                didSaveDisplayName = false
                inlineMessage = AppError.presentableMessage(for: error)
            }
            return
        }

        didSaveDisplayName = false
        inlineMessage = validationMessage
    }

    func logout() {
        Task {
            await logoutAction()
        }
    }

    var canSaveDisplayName: Bool {
        Self.displayNameValidationMessage(
            for: editedDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        ) == nil
    }

    static func displayNameValidationMessage(for displayName: String) -> String? {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let count = Array(trimmed).count
        if trimmed.isEmpty {
            return "Введите имя пользователя."
        }
        if count < 2 {
            return "Имя должно быть не короче 2 символов."
        }
        if count > 40 {
            return "Имя должно быть не длиннее 40 символов."
        }
        return nil
    }

    static func makeInitials(from displayName: String) -> String {
        let words = displayName.split(whereSeparator: \.isWhitespace)
        if let first = words.first,
           let second = words.dropFirst().first
        {
            return (String(first.prefix(1)) + String(second.prefix(1))).uppercased()
        }

        let fallback = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !fallback.isEmpty else { return "?" }
        return String(fallback.prefix(2)).uppercased()
    }

    static func phoneText(from contact: String?) -> String {
        guard let contact else {
            return "Номер недоступен"
        }

        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = trimmed.filter(\.isNumber)
        return digits.count >= 7 ? trimmed : "Номер недоступен"
    }

    static func isDemoAccount(displayName: String) -> Bool {
        displayName.localizedCaseInsensitiveContains("demo")
    }
}
