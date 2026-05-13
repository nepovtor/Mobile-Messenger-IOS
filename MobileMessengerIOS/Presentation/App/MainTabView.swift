import SwiftUI

struct MainTabView: View {
    @ObservedObject private var container: AppContainer

    init(container: AppContainer) {
        self.container = container
    }

    var body: some View {
        TabView(selection: selectedTabBinding) {
            ContactsView(container: container)
                .tag(AppContainer.MainTab.contacts)
                .tabItem {
                    Label("Контакты", systemImage: "person.2")
                }

            MapView(container: container)
                .tag(AppContainer.MainTab.map)
                .tabItem {
                    Label("Карта", systemImage: "map")
                }

            ChatListView(container: container)
                .tag(AppContainer.MainTab.chats)
                .tabItem {
                    Label("Чаты", systemImage: "message")
                }

            ProfileView(container: container)
                .tag(AppContainer.MainTab.profile)
                .tabItem {
                    Label("Профиль", systemImage: "person.crop.circle")
                }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Spacer()
                ConnectionStatusBadge(status: container.connectionStatus)
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 2)
        }
    }

    private var selectedTabBinding: Binding<AppContainer.MainTab> {
        Binding(
            get: { container.selectedTab },
            set: { container.selectedTab = $0 }
        )
    }
}

private struct ConnectionStatusBadge: View {
    let status: AppContainer.ConnectionStatus

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(accentColor)
                .frame(width: 8, height: 8)

            Text(label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .foregroundStyle(.white)
        .liquidGlassCapsule(
            tint: accentColor,
            secondaryTint: .white,
            innerDarkness: 0.62
        )
    }

    private var accentColor: Color {
        switch status {
        case .online:
            return AppTheme.mint
        case .connecting:
            return AppTheme.primary
        case .reconnecting:
            return AppTheme.amber
        case .offline:
            return AppTheme.coral
        }
    }

    private var label: String {
        switch status {
        case .online:
            return "Онлайн"
        case .connecting:
            return "Подключение"
        case .reconnecting:
            return "Переподключение"
        case .offline:
            return "Оффлайн"
        }
    }
}
