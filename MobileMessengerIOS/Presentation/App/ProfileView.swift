import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @State private var isShowingLogoutAlert = false
    @AppStorage(AppPreferenceKeys.theme) private var themePreference = AppThemePreference.system.rawValue
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue
    @AppStorage(AppPreferenceKeys.notificationsEnabled) private var notificationsEnabled = true
    @AppStorage(AppPreferenceKeys.quietHoursEnabled) private var quietHoursEnabled = false

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(uiColor: .systemGroupedBackground),
                        Color.blue.opacity(0.06),
                        Color(uiColor: .systemBackground)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        profileHeader
                        settingsCard
                        appCard
                        logoutCard
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
            .navigationBarHidden(true)
            .alert(t("Выйти из аккаунта?", "Sign out?"), isPresented: $isShowingLogoutAlert) {
                Button(t("Отмена", "Cancel"), role: .cancel) {}
                Button(t("Выйти", "Sign Out"), role: .destructive) {
                    sessionStore.logout()
                }
            } message: {
                Text(t("Текущая сессия будет завершена на этом устройстве.", "The current session will be ended on this device."))
            }
        }
        .onAppear {
            PushNotificationManager.shared.syncNotificationPreferences()
        }
        .onChange(of: notificationsEnabled) { _, _ in
            PushNotificationManager.shared.syncNotificationPreferences()
            if !notificationsEnabled {
                quietHoursEnabled = false
            }
        }
        .onChange(of: quietHoursEnabled) { _, _ in
            PushNotificationManager.shared.syncNotificationPreferences()
        }
    }

    private var profileHeader: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                gradient: Gradient(colors: [Color.blue.opacity(0.92), Color.purple.opacity(0.74)]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 250)
            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(Color.white.opacity(0.14))
                    .frame(width: 190, height: 190)
                    .offset(x: 40, y: -40)
            }

            HStack(alignment: .bottom, spacing: 18) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.22))
                        .frame(width: 104, height: 104)

                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 74))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(sessionStore.currentUserDisplayName ?? t("Пользователь", "User"))
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)

                    Text(shortUserID)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.white.opacity(0.82))

                    Label(t("Профиль синхронизирован", "Profile synced"), systemImage: "checkmark.seal.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Color.white.opacity(0.16), in: Capsule())
                }
            }
            .padding(24)
        }
    }

    private var settingsCard: some View {
        card(title: t("Настройки", "Settings")) {
            SettingsToggleRow(
                icon: "bell.badge.fill",
                color: .blue,
                title: t("Уведомления", "Notifications"),
                subtitle: notificationsEnabled ? t("Входящие оповещения включены", "Incoming alerts are enabled") : t("Все локальные уведомления выключены", "All local notifications are disabled"),
                isOn: $notificationsEnabled,
                showsDivider: true
            )

            SettingsToggleRow(
                icon: "moon.stars.fill",
                color: .indigo,
                title: t("Тихие часы", "Quiet Hours"),
                subtitle: quietHoursEnabled ? t("Сообщения приходят без локальных алертов", "Messages arrive without local alerts") : t("Оповещения приходят сразу", "Alerts arrive immediately"),
                isOn: $quietHoursEnabled,
                showsDivider: true
            )
            .disabled(!notificationsEnabled)
            .opacity(notificationsEnabled ? 1 : 0.45)

            Menu {
                ForEach(AppThemePreference.allCases) { theme in
                    Button {
                        themePreference = theme.rawValue
                    } label: {
                        if selectedTheme == theme {
                            Label(theme.title, systemImage: "checkmark")
                        } else {
                            Label(theme.title, systemImage: theme.icon)
                        }
                    }
                }
            } label: {
                SettingsMenuRow(
                    icon: "paintbrush.fill",
                    color: .purple,
                    title: t("Тема", "Theme"),
                    subtitle: selectedTheme.title,
                    showsDivider: true
                )
            }
            .buttonStyle(.plain)

            Menu {
                ForEach(AppLanguagePreference.allCases) { appLanguage in
                    Button {
                        languagePreference = appLanguage.rawValue
                    } label: {
                        if selectedLanguage == appLanguage {
                            Label(appLanguage.optionTitle, systemImage: "checkmark")
                        } else {
                            Label(appLanguage.optionTitle, systemImage: appLanguage == .system ? "iphone.gen3" : "globe")
                        }
                    }
                }
            } label: {
                SettingsMenuRow(
                    icon: "globe",
                    color: .teal,
                    title: t("Язык", "Language"),
                    subtitle: selectedLanguage.optionTitle,
                    showsDivider: false
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var appCard: some View {
        card(title: t("Приложение", "App")) {
            SettingsInfoRow(icon: "info.circle.fill", color: .blue, title: t("О приложении", "About"), subtitle: appVersionLabel, showsDivider: true)
            SettingsInfoRow(icon: "network", color: .teal, title: "Backend", subtitle: backendLabel, showsDivider: true)
            SettingsInfoRow(icon: "star.fill", color: .orange, title: t("Визуальный режим", "Visual style"), subtitle: t("Градиенты, карточки и адаптивная тема", "Gradients, cards and adaptive theme"), showsDivider: false)
        }
    }

    private var logoutCard: some View {
        Button {
            isShowingLogoutAlert = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "arrow.right.square.fill")
                    .foregroundColor(.red)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Выйти", "Sign Out"))
                        .font(.headline)
                        .foregroundColor(.red)
                    Text(t("Потребуется повторный вход по коду", "You will need to sign in with a code again"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(18)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func card<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.headline)

            VStack(spacing: 0) {
                content()
            }
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    private var appVersionLabel: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        return t("Версия \(version)", "Version \(version)")
    }

    private var shortUserID: String {
        guard let userID = sessionStore.currentUserID else {
            return t("ID: не определён", "ID: unavailable")
        }
        return "ID: \(userID.uuidString.prefix(8))..."
    }

    private var selectedTheme: AppThemePreference {
        AppThemePreference(rawValue: themePreference) ?? .system
    }

    private var selectedLanguage: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }

    private var backendLabel: String {
        let host = DefaultConfigService().restBaseURL.host() ?? "localhost"
        return "\(host):\(DefaultConfigService().restBaseURL.port ?? 8080)"
    }

    private func t(_ ru: String, _ en: String) -> String {
        selectedLanguage.text(ru: ru, en: en)
    }
}

private struct SettingsToggleRow: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String
    @Binding var isOn: Bool
    let showsDivider: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Toggle("", isOn: $isOn)
                    .labelsHidden()
                    .tint(color)
            }
            .padding(18)

            if showsDivider {
                Divider()
                    .padding(.leading, 60)
            }
        }
    }
}

private struct SettingsMenuRow: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String
    let showsDivider: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .foregroundColor(.secondary)
                    .font(.system(size: 14, weight: .semibold))
            }
            .padding(18)

            if showsDivider {
                Divider()
                    .padding(.leading, 60)
            }
        }
    }
}

private struct SettingsInfoRow: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String
    let showsDivider: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(18)

            if showsDivider {
                Divider()
                    .padding(.leading, 60)
            }
        }
    }
}
