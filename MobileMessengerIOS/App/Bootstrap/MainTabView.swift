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
    }

    private var selectedTabBinding: Binding<AppContainer.MainTab> {
        Binding(
            get: { container.selectedTab },
            set: { container.selectedTab = $0 }
        )
    }
}
