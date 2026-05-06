import Foundation

struct ProfileEnvironmentInfo: Equatable {
    let badgeTitle: String
    let title: String
    let detail: String

    static let unknown = ProfileEnvironmentInfo(
        badgeTitle: "App",
        title: "Configured environment",
        detail: "Using the current in-app backend configuration."
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
            return "Connected"
        case .connecting:
            return "Connecting"
        case .reconnecting:
            return "Reconnecting"
        case .disconnected:
            return "Disconnected"
        case .failed:
            return "Connection issue"
        }
    }

    var detail: String {
        switch self {
        case .connected:
            return "Realtime delivery is active."
        case .connecting:
            return "Establishing a secure realtime session."
        case .reconnecting:
            return "Trying to restore chat updates."
        case .disconnected:
            return "Realtime is currently offline."
        case .failed:
            return "The app will reconnect when possible."
        }
    }
}

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var displayName = "Unknown user"
    @Published private(set) var phone = "Unknown phone"
    @Published private(set) var userIDText = "User ID unavailable"
    @Published private(set) var userIDFootnote: String?
    @Published private(set) var initials = "?"
    @Published private(set) var accountBadgeTitle = "Account info"
    @Published private(set) var accountBadgeDetail = "Signed in user details"
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
                phone = "Unknown phone"
                lastLoadedUserID = nil
            }
            currentUserID = userID
            self.displayName = displayName.isEmpty ? "Unknown user" : displayName
            if !isEditingDisplayName {
                editedDisplayName = self.displayName
            }
            userIDText = userID.uuidString
            userIDFootnote = "User ID"
            initials = Self.makeInitials(from: self.displayName)
            hasStoredToken = !token.isEmpty

            if Self.isDemoAccount(displayName: self.displayName) {
                accountBadgeTitle = "Demo account"
                accountBadgeDetail = "Good for seeded chats and predictable demo flow."
            } else {
                accountBadgeTitle = "Account info"
                accountBadgeDetail = "Authenticated with the current backend session."
            }
        case .unauthenticated:
            currentUserID = nil
            displayName = "Unknown user"
            userIDText = "User ID unavailable"
            userIDFootnote = nil
            initials = "?"
            phone = "Unknown phone"
            accountBadgeTitle = "Account info"
            accountBadgeDetail = "No active account session."
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
            phone = "Unknown phone"
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
            phone = "Unknown phone"
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
            return "Unknown phone"
        }

        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = trimmed.filter(\.isNumber)
        return digits.count >= 7 ? trimmed : "Unknown phone"
    }

    static func isDemoAccount(displayName: String) -> Bool {
        displayName.localizedCaseInsensitiveContains("demo")
    }
}
