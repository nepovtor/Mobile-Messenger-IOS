import SwiftUI

enum AppPreferenceKeys {
    static let theme = "app.theme"
    static let language = "app.language"
    static let notificationsEnabled = "app.notifications.enabled"
    static let quietHoursEnabled = "app.notifications.quietHours"
}

enum AppThemePreference: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system:
            return AppLanguagePreference.localized(ru: "Авто", en: "Auto")
        case .light:
            return AppLanguagePreference.localized(ru: "Светлая", en: "Light")
        case .dark:
            return AppLanguagePreference.localized(ru: "Тёмная", en: "Dark")
        }
    }

    var icon: String {
        switch self {
        case .system:
            return "circle.lefthalf.filled"
        case .light:
            return "sun.max.fill"
        case .dark:
            return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system:
            return nil
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

enum AppLanguagePreference: String, CaseIterable, Identifiable {
    case system
    case russian
    case english

    var id: String { rawValue }

    static var current: AppLanguagePreference {
        let stored = UserDefaults.standard.string(forKey: AppPreferenceKeys.language) ?? AppLanguagePreference.system.rawValue
        return AppLanguagePreference(rawValue: stored) ?? .system
    }

    static func localized(ru: String, en: String) -> String {
        current.text(ru: ru, en: en)
    }

    var locale: Locale {
        switch resolvedCode {
        case "ru":
            return Locale(identifier: "ru_RU")
        default:
            return Locale(identifier: "en_US")
        }
    }

    var resolvedCode: String {
        switch self {
        case .system:
            if let preferred = Locale.preferredLanguages.first?.lowercased(), preferred.hasPrefix("ru") {
                return "ru"
            }
            return "en"
        case .russian:
            return "ru"
        case .english:
            return "en"
        }
    }

    var isRussian: Bool {
        resolvedCode == "ru"
    }

    func text(ru: String, en: String) -> String {
        isRussian ? ru : en
    }

    var optionTitle: String {
        switch self {
        case .system:
            return isRussian ? "Системный" : "System"
        case .russian:
            return "Русский"
        case .english:
            return "English"
        }
    }

    var optionSubtitle: String {
        switch self {
        case .system:
            return text(ru: "Следует языку устройства", en: "Follows device language")
        case .russian:
            return text(ru: "Русский интерфейс", en: "Russian interface")
        case .english:
            return text(ru: "Английский интерфейс", en: "English interface")
        }
    }
}

struct ContentView: View {
    @StateObject private var container: AppContainer
    @StateObject private var sessionStore: SessionStore
    @AppStorage(AppPreferenceKeys.theme) private var themePreference = AppThemePreference.system.rawValue
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

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
                    .transition(.opacity.combined(with: .scale(scale: 0.99)))
            case .unauthenticated:
                AuthView(container: container) {
                    // SessionStore обновит состояние самостоятельно после успешной авторизации
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .preferredColorScheme(selectedTheme.colorScheme)
        .environment(\.locale, selectedLanguage.locale)
        .animation(.easeInOut(duration: 0.25), value: sessionStore.isAuthenticated)
        .animation(.easeInOut(duration: 0.25), value: themePreference)
        .animation(.easeInOut(duration: 0.25), value: languagePreference)
        .environmentObject(sessionStore)
        .environmentObject(container)
    }

    private var selectedTheme: AppThemePreference {
        AppThemePreference(rawValue: themePreference) ?? .system
    }

    private var selectedLanguage: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }
}
