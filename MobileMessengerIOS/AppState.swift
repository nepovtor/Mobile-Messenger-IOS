import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var authToken: String?

    var isAuthenticated: Bool {
        authToken != nil
    }

    init(authToken: String? = nil) {
        self.authToken = authToken
    }

    func authenticate(with token: String) {
        authToken = token
    }

    func logout() {
        authToken = nil
    }
}
