import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            ChatListView()
                .tabItem {
                    Label("Чаты", systemImage: "bubble.left.and.bubble.right.fill")
                }

            ProfileView()
                .tabItem {
                    Label("Профиль", systemImage: "person.crop.circle")
                }
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState(authToken: "preview-token"))
}
