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
                    VStack {
                        Image(systemName: "message.fill")
                        Text("Чаты")
                    }
                }
                .tag(0)

            ProfileView()
                .tabItem {
                    VStack {
                        Image(systemName: "person.fill")
                        Text("Профиль")
                    }
                }
                .tag(1)
        }
        .accentColor(.blue)
        .onAppear {
            // Настройка внешнего вида TabBar
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor.systemBackground

            UITabBar.appearance().standardAppearance = appearance
            if #available(iOS 15.0, *) {
                UITabBar.appearance().scrollEdgeAppearance = appearance
            }
        }
    }
}
