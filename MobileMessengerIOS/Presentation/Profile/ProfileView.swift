import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
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
                    realtimeSection
                    securitySection
                    appearanceSection
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

                    Text(viewModel.phone)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    if let userIDFootnote = viewModel.userIDFootnote {
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
                            colors: [Color.blue.opacity(0.95), Color.cyan.opacity(0.72)],
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
                ProfileStatusBadge(title: viewModel.realtimeStatus.title, tone: realtimeBadgeTone)
                Spacer()
                ProfileStatusBadge(title: viewModel.environmentInfo.badgeTitle, tone: .neutral)
            }
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.24), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.08), radius: 20, y: 12)
    }

    private var accountSection: some View {
        ProfileSectionCard(title: "Account") {
            ProfileInfoRow(
                systemImage: "phone.fill",
                title: "Phone",
                value: viewModel.phone,
                detail: "Current account contact from the authenticated profile.",
                tint: .blue
            )

            divider

            ProfileInfoRow(
                systemImage: "person.text.rectangle.fill",
                title: "Display name",
                value: viewModel.displayName,
                detail: viewModel.accountBadgeDetail,
                tint: .green
            )

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
                value: viewModel.hasStoredToken ? "Protected on this device" : "No active token",
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

    private var actionsSection: some View {
        ProfileSectionCard(title: "Actions") {
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
        "\(sessionStore.authToken ?? "logged-out")-\(container.configurationRevision)-\(String(describing: container.realtimeConnectionState))"
    }

    private var backgroundView: some View {
        ZStack(alignment: .top) {
            Color(uiColor: .systemGroupedBackground)
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    Color.blue.opacity(0.16),
                    Color.cyan.opacity(0.09),
                    Color(uiColor: .systemGroupedBackground)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 340)
            .ignoresSafeArea(edges: .top)

            Circle()
                .fill(Color.white.opacity(0.34))
                .frame(width: 240, height: 240)
                .blur(radius: 20)
                .offset(x: -110, y: -80)

            Circle()
                .fill(Color.cyan.opacity(0.14))
                .frame(width: 260, height: 260)
                .blur(radius: 28)
                .offset(x: 130, y: -90)
        }
    }

    @ViewBuilder
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

    private func syncViewModel() {
        viewModel.update(
            sessionState: sessionStore.state,
            realtimeState: container.realtimeConnectionState,
            environment: container.profileEnvironmentInfo
        )
    }
}
