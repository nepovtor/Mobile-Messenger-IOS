import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var appState: AppState
    @State private var notificationsEnabled: Bool = true
    @State private var analyticsEnabled: Bool = true

    var body: some View {
        NavigationStack {
            List {
                Section(header: Text("Аккаунт")) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Текущий пользователь")
                                .font(.headline)
                            Text(appState.authToken ?? "Не авторизован")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                        }
                        Spacer()
                        Image(systemName: "person.crop.circle.fill")
                            .resizable()
                            .frame(width: 48, height: 48)
                            .foregroundStyle(.blue)
                    }
                }

                Section(header: Text("Настройки")) {
                    Toggle(isOn: $notificationsEnabled) {
                        Label("Пуш-уведомления", systemImage: "bell.badge")
                    }

                    Toggle(isOn: $analyticsEnabled) {
                        Label("Отправлять аналитику", systemImage: "chart.bar")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        appState.logout()
                    } label: {
                        Label("Выйти", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Профиль")
        }
    }
}

#Preview {
    ProfileView()
        .environmentObject(AppState(authToken: "preview-token"))
}
