import SwiftUI

struct ContentView: View {
    @StateObject private var container: AppContainer
    @StateObject private var sessionStore: SessionStore

    init() {
        let container = AppContainer.shared
        _container = StateObject(wrappedValue: container)
        _sessionStore = StateObject(wrappedValue: container.sessionStore)
    }

    var body: some View {
        Group {
            switch sessionStore.state {
            case .authenticated:
                MainTabView(container: container)
            case .unauthenticated:
                AuthView(container: container) {
                    // SessionStore обновит состояние самостоятельно после успешной авторизации
                }
            }
        }
        .environmentObject(sessionStore)
        .environmentObject(container)
    }
}
