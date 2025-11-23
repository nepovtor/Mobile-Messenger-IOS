import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var sessionStore: SessionStore

    var body: some View {
        NavigationStack {
            Form {
                Section("Профиль") {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.blue)
                        VStack(alignment: .leading) {
                            Text(SessionStore.Constants.currentUserDisplayName)
                                .font(.headline)
                            Text("ID: \(SessionStore.Constants.currentUserID.uuidString)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section("Сессия") {
                    Button("Выйти") {
                        sessionStore.logout()
                    }
                    .foregroundColor(.red)
                }
            }
            .navigationTitle("Профиль")
        }
    }
}
