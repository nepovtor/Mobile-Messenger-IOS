import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var sessionStore: SessionStore

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemGroupedBackground)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Шапка профиля
                    ZStack {
                        LinearGradient(
                            gradient: Gradient(colors: [Color.blue.opacity(0.8), Color.purple.opacity(0.6)]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(height: 200)

                        VStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(Color.white.opacity(0.2))
                                    .frame(width: 100, height: 100)

                                Image(systemName: "person.circle.fill")
                                    .font(.system(size: 80))
                                    .foregroundColor(.white)
                            }

                            VStack(spacing: 4) {
                                Text(sessionStore.currentUserDisplayName ?? "Пользователь")
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundColor(.white)

                                Text(shortUserID)
                                    .font(.system(size: 14))
                                    .foregroundColor(.white.opacity(0.8))
                            }
                        }
                        .padding(.top, 40)
                    }

                    Form {
                        Section("Настройки") {
                            HStack {
                                Image(systemName: "bell.fill")
                                    .foregroundColor(.blue)
                                    .frame(width: 24)
                                Text("Уведомления")
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 14))
                            }

                            HStack {
                                Image(systemName: "lock.fill")
                                    .foregroundColor(.green)
                                    .frame(width: 24)
                                Text("Конфиденциальность")
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 14))
                            }

                            HStack {
                                Image(systemName: "paintbrush.fill")
                                    .foregroundColor(.purple)
                                    .frame(width: 24)
                                Text("Тема")
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 14))
                            }
                        }

                        Section("Приложение") {
                            HStack {
                                Image(systemName: "info.circle.fill")
                                    .foregroundColor(.blue)
                                    .frame(width: 24)
                                Text("О приложении")
                                Spacer()
                                Text("v1.0.0")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 14))
                            }

                            HStack {
                                Image(systemName: "star.fill")
                                    .foregroundColor(.orange)
                                    .frame(width: 24)
                                Text("Оценить приложение")
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 14))
                            }
                        }

                        Section {
                            Button(action: {
                                sessionStore.logout()
                            }) {
                                HStack {
                                    Image(systemName: "arrow.right.square.fill")
                                        .foregroundColor(.red)
                                        .frame(width: 24)
                                    Text("Выйти")
                                        .foregroundColor(.red)
                                }
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("")
            .navigationBarHidden(true)
        }
    }

    private var shortUserID: String {
        guard let userID = sessionStore.currentUserID else {
            return "ID: не определён"
        }
        return "ID: \(userID.uuidString.prefix(8))..."
    }
}
