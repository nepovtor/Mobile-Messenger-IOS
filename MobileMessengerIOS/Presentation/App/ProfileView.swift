import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var sessionStore: SessionStore

    var body: some View {
        NavigationStack {
            Form {
                Section("Профиль") {
                    let profile = currentProfile
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.blue)
                        VStack(alignment: .leading) {
                            Text(profile.displayName)
                                .font(.headline)
                            Text("ID: \(profile.userID.uuidString)")
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

    private var currentProfile: (userID: UUID, displayName: String) {
        switch sessionStore.state {
        case .authenticated(_, let userID, let displayName):
            return (userID, displayName)
        case .unauthenticated:
            return (SessionStore.Constants.currentUserID, SessionStore.Constants.currentUserDisplayName)
        }
    }
}
