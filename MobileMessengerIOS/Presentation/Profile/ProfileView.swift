import SwiftUI

struct ProfileView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @ObservedObject private var notificationManager = PushNotificationManager.shared
    @StateObject private var viewModel: ProfileViewModel

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeProfileViewModel())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    headerCard
                    accountSection
                    appearanceSection
                    preferencesSection
                    notificationsSection
                    if container.showTechnicalDetailsInProfile {
                        realtimeSection
                        securitySection
                    }
                    actionsSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
            .background(backgroundView)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                syncViewModel()
                await viewModel.refreshProfile()
            }
            .task(id: taskKey) {
                syncViewModel()
                await viewModel.loadProfileIfNeeded()
            }
            .onChange(of: sessionStore.state) { _, _ in
                syncViewModel()
            }
            .onChange(of: container.realtimeConnectionState) { _, _ in
                syncViewModel()
            }
            .onChange(of: container.configurationRevision) { _, _ in
                syncViewModel()
            }
        }
    }

    private var headerCard: some View {
        VStack(spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 10) {
                    ProfileStatusBadge(
                        title: viewModel.accountBadgeTitle,
                        tone: viewModel.accountBadgeTitle == "Demo account" ? .warning : .neutral
                    )

                    Text(viewModel.displayName)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)

                    if container.showPhoneNumberInProfile {
                        Text(viewModel.phone)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    if container.showTechnicalDetailsInProfile,
                       let userIDFootnote = viewModel.userIDFootnote {
                        Text("\(userIDFootnote): \(viewModel.userIDText)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 16)

                Circle()
                    .fill(
                        LinearGradient(
                            colors: [AppTheme.primary.opacity(0.95), AppTheme.aqua.opacity(0.72)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 88, height: 88)
                    .overlay {
                        Text(viewModel.initials)
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
            }

            HStack {
                ProfileStatusBadge(
                    title: viewModel.realtimeStatus.title,
                    tone: realtimeBadgeTone
                )
                Spacer()
                ProfileStatusBadge(
                    title: viewModel.environmentInfo.badgeTitle,
                    tone: .neutral
                )
            }
        }
        .padding(22)
        .liquidGlassCard(
            cornerRadius: 30,
            tint: AppTheme.primary,
            secondaryTint: AppTheme.aqua,
            innerDarkness: isHighContrastDarkActive ? 0.10 : 0.06
        )
    }

    private var accountSection: some View {
        ProfileSectionCard(title: "Account") {
            if container.showPhoneNumberInProfile {
                ProfileInfoRow(
                    systemImage: "phone.fill",
                    title: "Phone",
                    value: viewModel.phone,
                    detail: "Current account contact from the authenticated profile.",
                    tint: .blue
                )

                divider
            }

            VStack(alignment: .leading, spacing: 14) {
                ProfileInfoRow(
                    systemImage: "person.text.rectangle.fill",
                    title: "Display name",
                    value: viewModel.displayName,
                    detail: viewModel.accountBadgeDetail,
                    tint: .green
                )

                if viewModel.isEditingDisplayName {
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("Новое имя", text: $viewModel.editedDisplayName)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(
                                LiquidGlassRoundedSurface(
                                    cornerRadius: 16,
                                    tint: .white,
                                    secondaryTint: AppTheme.aqua,
                                    innerDarkness: isHighContrastDarkActive ? 0.18 : 0.10
                                )
                            )

                        if let message = viewModel.inlineMessage {
                            Text(message)
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(viewModel.didSaveDisplayName ? .green : .red)
                        }

                        HStack(spacing: 12) {
                            Button("Cancel") {
                                viewModel.cancelEditingDisplayName()
                            }
                            .buttonStyle(
                                LiquidGlassSecondaryButtonStyle(
                                    tint: .white,
                                    secondaryTint: AppTheme.aqua
                                )
                            )

                            Button {
                                Task {
                                    await viewModel.saveDisplayName()
                                }
                            } label: {
                                if viewModel.isSavingDisplayName {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Save")
                                }
                            }
                            .buttonStyle(
                                LiquidGlassProminentButtonStyle(
                                    tint: AppTheme.primary,
                                    secondaryTint: AppTheme.aqua
                                )
                            )
                            .disabled(viewModel.isSavingDisplayName || !viewModel.canSaveDisplayName)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 18)
                } else {
                    HStack {
                        Button("Изменить имя") {
                            viewModel.startEditingDisplayName()
                        }
                        .buttonStyle(
                            LiquidGlassProminentButtonStyle(
                                tint: AppTheme.primary,
                                secondaryTint: AppTheme.aqua
                            )
                        )
                        Spacer()
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 18)
                }
            }

            if container.showTechnicalDetailsInProfile {
                divider

                ProfileInfoRow(
                    systemImage: "number.square.fill",
                    title: "User ID",
                    value: viewModel.userIDText,
                    detail: "Used to scope chat ownership and session identity.",
                    tint: .indigo,
                    monospaced: true
                )

                divider

                ProfileInfoRow(
                    systemImage: "server.rack",
                    title: viewModel.environmentInfo.title,
                    value: viewModel.environmentInfo.badgeTitle,
                    detail: viewModel.environmentInfo.detail,
                    tint: .orange
                )
            }
        }
    }

    private var realtimeSection: some View {
        ProfileSectionCard(title: "Realtime") {
            ProfileInfoRow(
                systemImage: realtimeSystemImage,
                title: "Connection status",
                value: viewModel.realtimeStatus.title,
                detail: viewModel.realtimeStatus.detail,
                tint: realtimeAccent
            )
        }
    }

    private var securitySection: some View {
        ProfileSectionCard(title: "Security") {
            ProfileInfoRow(
                systemImage: "key.fill",
                title: "Token stored in Keychain",
                value: viewModel.hasStoredToken
                    ? "Protected on this device"
                    : "No active token",
                detail: "The token value is never shown on the profile screen.",
                tint: .purple
            )

            divider

            ProfileInfoRow(
                systemImage: "shield.lefthalf.filled",
                title: "Session cleanup on logout",
                value: "Chats, messages, session, and realtime are cleared",
                detail: "Logout reuses the existing secure cleanup flow.",
                tint: .red
            )
        }
    }

    private var appearanceSection: some View {
        ProfileSectionCard(title: "Appearance") {
            VStack(alignment: .leading, spacing: 16) {
                ProfileInfoRow(
                    systemImage: container.appearanceMode.systemImage,
                    title: "Theme",
                    value: container.appearanceMode.title,
                    detail: "Follows the existing app appearance setting.",
                    tint: .teal
                )

                Picker("Theme", selection: appearanceBinding) {
                    ForEach(AppContainer.AppearanceMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 18)
                .padding(.bottom, 18)
            }
        }
    }

    private var preferencesSection: some View {
        ProfileSectionCard(title: "Preferences") {
            settingsToggleRow(
                systemImage: "circle.lefthalf.filled",
                title: "High contrast dark mode",
                detail: "Makes cards and text easier to read when the app is in dark appearance.",
                tint: .indigo,
                isOn: highContrastDarkModeBinding
            )

            divider

            settingsToggleRow(
                systemImage: "phone.circle.fill",
                title: "Show phone number",
                detail: "Displays your phone in the profile header and account details.",
                tint: .blue,
                isOn: showPhoneNumberBinding
            )

            divider

            settingsToggleRow(
                systemImage: "gearshape.2.fill",
                title: "Show technical details",
                detail: "Shows realtime, security, environment, and user ID blocks in the profile.",
                tint: .orange,
                isOn: showTechnicalDetailsBinding
            )
        }
    }

    private var notificationsSection: some View {
        ProfileSectionCard(title: "Push notifications") {
            ProfileInfoRow(
                systemImage: "bell.badge.fill",
                title: "Remote notifications",
                value: notificationManager.statusTitle,
                detail: notificationManager.statusDetail,
                tint: notificationAccent
            )

            if container.showTechnicalDetailsInProfile,
               let tokenPreview = notificationManager.deviceTokenPreview {
                divider

                ProfileInfoRow(
                    systemImage: "number.square.fill",
                    title: "APNs token",
                    value: tokenPreview,
                    detail: "Latest device token seen on this device.",
                    tint: .indigo,
                    monospaced: true
                )
            }

            divider

            HStack(spacing: 12) {
                if notificationManager.canRequestAuthorization {
                    Button {
                        Task {
                            await notificationManager.requestAuthorizationAndRegister()
                        }
                    } label: {
                        Text("Включить push")
                    }
                    .buttonStyle(
                        LiquidGlassProminentButtonStyle(
                            tint: AppTheme.primary,
                            secondaryTint: AppTheme.aqua
                        )
                    )
                }

                if notificationManager.canRefreshRegistration {
                    Button {
                        Task {
                            await notificationManager.syncAuthorizedStateForCurrentSession()
                        }
                    } label: {
                        Text("Обновить регистрацию")
                    }
                    .buttonStyle(
                        LiquidGlassSecondaryButtonStyle(
                            tint: .white,
                            secondaryTint: AppTheme.aqua
                        )
                    )
                }

                if notificationManager.canOpenSettings {
                    Button("Открыть Settings") {
                        notificationManager.openApplicationSettings()
                    }
                    .buttonStyle(
                        LiquidGlassSecondaryButtonStyle(
                            tint: .white,
                            secondaryTint: AppTheme.coral
                        )
                    )
                }

                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
        }
    }

    private var actionsSection: some View {
        ProfileSectionCard(title: "Actions") {
            if !viewModel.isEditingDisplayName,
               let message = viewModel.inlineMessage {
                HStack {
                    Text(message)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(viewModel.didSaveDisplayName ? .green : .red)
                    Spacer()
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)

                divider
            }

            Button {
                Task {
                    syncViewModel()
                    await viewModel.refreshProfile()
                }
            } label: {
                actionRow(
                    systemImage: "arrow.clockwise",
                    title: "Refresh profile",
                    detail: "Reload account contact and status details.",
                    tint: .blue
                )
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isLoadingProfile)

            divider

            Button(role: .destructive) {
                viewModel.logout()
            } label: {
                actionRow(
                    systemImage: "rectangle.portrait.and.arrow.right",
                    title: "Logout",
                    detail: "End the current session safely.",
                    tint: .red,
                    isDestructive: true
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var appearanceBinding: Binding<AppContainer.AppearanceMode> {
        Binding(
            get: { container.appearanceMode },
            set: { container.updateAppearanceMode($0) }
        )
    }

    private var highContrastDarkModeBinding: Binding<Bool> {
        Binding(
            get: { container.highContrastDarkMode },
            set: { container.updateHighContrastDarkMode($0) }
        )
    }

    private var showPhoneNumberBinding: Binding<Bool> {
        Binding(
            get: { container.showPhoneNumberInProfile },
            set: { container.updateShowPhoneNumberInProfile($0) }
        )
    }

    private var showTechnicalDetailsBinding: Binding<Bool> {
        Binding(
            get: { container.showTechnicalDetailsInProfile },
            set: { container.updateShowTechnicalDetailsInProfile($0) }
        )
    }

    private var realtimeBadgeTone: ProfileStatusBadge.Tone {
        switch viewModel.realtimeStatus {
        case .connected:
            return .success
        case .connecting:
            return .neutral
        case .reconnecting:
            return .warning
        case .disconnected, .failed:
            return .danger
        }
    }

    private var realtimeAccent: Color {
        switch viewModel.realtimeStatus {
        case .connected:
            return .green
        case .connecting:
            return .blue
        case .reconnecting:
            return .orange
        case .disconnected, .failed:
            return .red
        }
    }

    private var notificationAccent: Color {
        switch notificationManager.authorizationState {
        case .authorized:
            switch notificationManager.syncState {
            case .synced:
                return .green
            case .registering:
                return .blue
            case .failed:
                return .red
            case .idle:
                return .orange
            }
        case .denied:
            return .red
        case .notDetermined, .unknown:
            return .orange
        }
    }

    private var realtimeSystemImage: String {
        switch viewModel.realtimeStatus {
        case .connected:
            return "checkmark.circle.fill"
        case .connecting:
            return "antenna.radiowaves.left.and.right"
        case .reconnecting:
            return "arrow.triangle.2.circlepath"
        case .disconnected:
            return "wifi.slash"
        case .failed:
            return "exclamationmark.triangle.fill"
        }
    }

    private var divider: some View {
        Divider()
            .padding(.leading, 58)
    }

    private var taskKey: String {
        let tokenPart = sessionStore.authToken ?? "logged-out"
        let realtimePart = String(describing: container.realtimeConnectionState)
        return "\(tokenPart)-\(container.configurationRevision)-\(realtimePart)"
    }

    private var backgroundView: some View {
        LiquidGlassBackground(
            accent: AppTheme.primary,
            secondaryAccent: AppTheme.aqua,
            tertiaryAccent: AppTheme.coral
        )
    }

    private func actionRow(
        systemImage: String,
        title: String,
        detail: String,
        tint: Color,
        isDestructive: Bool = false
    ) -> some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint.opacity(0.14))
                .frame(width: 40, height: 40)
                .overlay {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(tint)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(isDestructive ? .red : .primary)

                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if systemImage == "arrow.clockwise", viewModel.isLoadingProfile {
                ProgressView()
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .contentShape(Rectangle())
    }

    private func settingsToggleRow(
        systemImage: String,
        title: String,
        detail: String,
        tint: Color,
        isOn: Binding<Bool>
    ) -> some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint.opacity(0.14))
                .frame(width: 40, height: 40)
                .overlay {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(tint)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)

                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 12)

            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(tint)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
    }

    private var headerCardBackgroundStyle: AnyShapeStyle {
        if isHighContrastDarkActive {
            return AnyShapeStyle(Color(uiColor: .secondarySystemBackground))
        }
        return AnyShapeStyle(Color(uiColor: .systemBackground).opacity(0.72))
    }

    private var headerCardBorderColor: Color {
        if isHighContrastDarkActive {
            return Color.white.opacity(0.18)
        }
        return Color.white.opacity(0.24)
    }

    private var displayNameFieldBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color(uiColor: .tertiarySystemBackground)
        }
        return Color(uiColor: .secondarySystemBackground)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }

    private func syncViewModel() {
        viewModel.update(
            sessionState: sessionStore.state,
            realtimeState: container.realtimeConnectionState,
            environment: container.profileEnvironmentInfo
        )
    }
}
