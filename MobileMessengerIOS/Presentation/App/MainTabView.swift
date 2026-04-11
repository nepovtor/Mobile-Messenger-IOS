import SwiftUI

struct MainTabView: View {
    @ObservedObject private var container: AppContainer

    init(container: AppContainer) {
        self.container = container
    }

    var body: some View {
        TabView {
            ChatListView(container: container)
                .tabItem {
                    Label("Чаты", systemImage: "message")
                }

            ProfileView()
                .tabItem {
                    Label("Профиль", systemImage: "person.crop.circle")
                }
        }
        .task {
            await PushNotificationManager.shared.registerForNotifications()
        }
    }
}
