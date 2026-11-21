import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var container: AppContainer
    @StateObject private var sessionStore: SessionStore

    init() {
        let container = AppContainer.shared
        _container = StateObject(wrappedValue: container)
        _sessionStore = StateObject(wrappedValue: container.sessionStore)
    }

    var body: some View {
        Group {
            if sessionStore.isLogoutPending {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Выход не завершён").font(.title2)
                    Text(container.logoutError ?? "Ожидаем подтверждения отзыва сессии от сервера. Переписка заблокирована.")
                    Button(container.isLoggingOut ? "Проверяем…" : "Повторить выход") {
                        Task { await container.logout() }
                    }.disabled(container.isLoggingOut)
                }.padding(24)
            } else {
            switch sessionStore.state {
            case .authenticated:
                MainTabView(container: container)
            case .unauthenticated:
                AuthView(container: container) {
                    // SessionStore обновит состояние самостоятельно после успешной авторизации
                }
            }
            }
        }
        .id(container.configurationRevision)
        .environmentObject(sessionStore)
        .environmentObject(container)
        .preferredColorScheme(container.appearanceMode.colorScheme)
        .tint(AppTheme.primary)
        .task {
            container.handleScenePhase(scenePhase)
        }
        .onChange(of: scenePhase) { _, newValue in
            container.handleScenePhase(newValue)
        }
    }
}
