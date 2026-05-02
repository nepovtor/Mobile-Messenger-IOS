import SwiftUI

struct MainTabView: View {
    @ObservedObject private var container: AppContainer

    init(container: AppContainer) {
        self.container = container
    }

    var body: some View {
        TabView {
            ContactsView(container: container)
                .tabItem {
                    Label("Контакты", systemImage: "person.2")
                }

            ChatListView(container: container)
                .tabItem {
                    Label("Чаты", systemImage: "message")
                }

            ProfileView(container: container)
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
        .task {
            await PushNotificationManager.shared.registerForNotifications()
        }
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
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.black.opacity(0.78))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        }
        .foregroundStyle(.white)
        .shadow(color: Color.black.opacity(0.16), radius: 10, x: 0, y: 6)
    }

    private var accentColor: Color {
        switch status {
        case .online:
            return Color.green
        case .connecting:
            return Color.blue
        case .reconnecting:
            return Color.orange
        case .offline:
            return Color.red
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
