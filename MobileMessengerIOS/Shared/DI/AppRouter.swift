import Combine
import Foundation

@MainActor
public final class AppRouter: ObservableObject {
    public enum MainTab: Hashable {
        case contacts
        case map
        case chats
        case profile
    }

    @Published public var selectedTab: MainTab = .contacts
    @Published public private(set) var pendingPushChatID: UUID?

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

    public func resetForLoggedOutSession() {
        pendingPushChatID = nil
        selectedTab = .contacts
    }
}
