import SwiftUI

struct ContentView: View {
    @StateObject private var appState = AppState()

    var body: some View {
        Group {
            if appState.isAuthenticated {
                MainTabView()
            } else {
                AuthView { token in
                    appState.authenticate(with: token)
                }
            }
        }
        .environmentObject(appState)
    }
}

#Preview {
    ContentView()
}
