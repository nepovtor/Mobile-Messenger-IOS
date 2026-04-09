import SwiftUI

struct MainTabView: View {
    @ObservedObject private var container: AppContainer
    @AppStorage(AppPreferenceKeys.theme) private var themePreference = AppThemePreference.system.rawValue
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

    init(container: AppContainer) {
        self.container = container
    }

    var body: some View {
        TabView {
            ChatListView(container: container)
                .tabItem {
                    Label(language.text(ru: "Чаты", en: "Chats"), systemImage: "bubble.left.and.bubble.right.fill")
                }
                .tag(0)

            ContactsView(container: container)
                .tabItem {
                    Label(language.text(ru: "Контакты", en: "Contacts"), systemImage: "person.2.fill")
                }
                .tag(1)

            ProfileView(container: container)
                .tabItem {
                    Label(language.text(ru: "Профиль", en: "Profile"), systemImage: "person.crop.circle.fill")
                }
                .tag(2)
        }
        .tint(Color(red: 0.00, green: 0.48, blue: 1.00))
        .onAppear {
            configureTabBarAppearance()
        }
        .onChange(of: themePreference) { _, _ in
            configureTabBarAppearance()
        }
        .onChange(of: languagePreference) { _, _ in
            configureTabBarAppearance()
        }
    }

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        appearance.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.92)
        appearance.shadowColor = UIColor.separator.withAlphaComponent(0.18)

        let selectedColor = UIColor.systemBlue
        let normalColor = UIColor.secondaryLabel
        let layouts = [
            appearance.stackedLayoutAppearance,
            appearance.inlineLayoutAppearance,
            appearance.compactInlineLayoutAppearance
        ]

        layouts.forEach { layout in
            layout.selected.iconColor = selectedColor
            layout.selected.titleTextAttributes = [.foregroundColor: selectedColor]
            layout.normal.iconColor = normalColor
            layout.normal.titleTextAttributes = [.foregroundColor: normalColor]
        }

        UITabBar.appearance().standardAppearance = appearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
    }

    private var language: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }
}
