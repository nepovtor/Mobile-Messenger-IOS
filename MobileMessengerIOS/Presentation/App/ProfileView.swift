import SwiftUI

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var contact: String?
    @Published private(set) var isLoading = false

    private let contactsService: ContactsNetworking
    private var loadedUserID: UUID?

    init(contactsService: ContactsNetworking) {
        self.contactsService = contactsService
    }

    func loadIfNeeded(for userID: UUID) async {
        guard loadedUserID != userID else { return }
        contact = nil
        await refresh(for: userID)
    }

    func refresh(for userID: UUID) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let contacts = try await contactsService.listContacts()
            contact = contacts.first(where: { $0.isCurrentUser || $0.userID == userID })?.contact
            loadedUserID = userID
        } catch {
            contact = nil
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var viewModel: ProfileViewModel

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeProfileViewModel())
    }

    var body: some View {
        let profile = currentProfile

        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    heroCard(for: profile)
                    infoSection(for: profile)
                    appearanceSection
                    sessionSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.refresh(for: profile.userID)
            }
            .background(backgroundView)
            .navigationTitle("Профиль")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: profile.userID) {
                await viewModel.loadIfNeeded(for: profile.userID)
            }
        }
    }

    private func heroCard(for profile: (userID: UUID, displayName: String)) -> some View {
        VStack(spacing: 18) {
            HStack(spacing: 8) {
                Image(systemName: "lock.shield.fill")
                    .font(.caption.weight(.bold))
                Text("Личный профиль")
                    .font(.footnote.weight(.semibold))
            }
            .foregroundStyle(.white.opacity(0.95))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(.white.opacity(0.14), in: Capsule())

            ZStack(alignment: .bottomTrailing) {
                Circle()
                    .fill(.white.opacity(0.16))
                    .frame(width: 108, height: 108)
                    .overlay {
                        Text(initials(from: profile.displayName))
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }

                Circle()
                    .fill(Color(red: 0.24, green: 0.86, blue: 0.46))
                    .frame(width: 20, height: 20)
                    .overlay(
                        Circle()
                            .stroke(.white, lineWidth: 4)
                    )
            }

            VStack(spacing: 8) {
                Text(profile.displayName)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                Group {
                    if let contact = viewModel.contact {
                        Text(contact)
                    } else if viewModel.isLoading {
                        Text("Загружаем контакт...")
                    } else {
                        Text("Аккаунт готов к работе")
                    }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white.opacity(0.82))
                .multilineTextAlignment(.center)
            }

            HStack(spacing: 10) {
                heroChip(title: "ID \(shortID(from: profile.userID))", systemImage: "number")
                heroChip(title: "Сессия активна", systemImage: "checkmark.circle.fill")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 28)
        .background(
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.16, green: 0.50, blue: 0.98),
                            Color(red: 0.24, green: 0.68, blue: 1.0)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 32, style: .continuous)
                        .fill(.white.opacity(0.08))
                        .blur(radius: 30)
                        .offset(x: 40, y: -60)
                        .mask(
                            RoundedRectangle(cornerRadius: 32, style: .continuous)
                        )
                )
        )
        .shadow(color: Color.black.opacity(0.14), radius: 26, y: 16)
    }

    private func infoSection(for profile: (userID: UUID, displayName: String)) -> some View {
        ProfileSection(title: "Информация") {
            ProfileInfoRow(
                systemImage: contactIconName,
                tint: Color(red: 0.15, green: 0.54, blue: 0.98),
                value: contactValue,
                title: contactTitle,
                isMonospaced: false
            )

            Divider()
                .padding(.leading, 58)

            ProfileInfoRow(
                systemImage: "person.text.rectangle.fill",
                tint: Color(red: 0.22, green: 0.70, blue: 0.50),
                value: profile.displayName,
                title: "Имя профиля",
                isMonospaced: false
            )

            Divider()
                .padding(.leading, 58)

            ProfileInfoRow(
                systemImage: "number.square.fill",
                tint: Color(red: 0.50, green: 0.46, blue: 0.96),
                value: profile.userID.uuidString,
                title: "ID аккаунта",
                isMonospaced: true
            )
        }
    }

    private var sessionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Сессия")

            VStack(spacing: 0) {
                ProfileInfoRow(
                    systemImage: "iphone.gen3",
                    tint: Color(red: 0.96, green: 0.63, blue: 0.22),
                    value: "Это устройство",
                    title: "Текущая активная сессия",
                    isMonospaced: false
                )

                Divider()
                    .padding(.leading, 58)

                ProfileInfoRow(
                    systemImage: "message.badge.waveform.fill",
                    tint: Color(red: 0.22, green: 0.74, blue: 0.86),
                    value: "Messenger готов к диалогам",
                    title: "Уведомления и чат доступны",
                    isMonospaced: false
                )

                Divider()
                    .padding(.leading, 58)

                Button(role: .destructive) {
                    sessionStore.logout()
                } label: {
                    HStack(spacing: 14) {
                        iconBadge(
                            systemImage: "rectangle.portrait.and.arrow.right",
                            tint: .red
                        )

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Выйти")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.red)

                            Text("Завершить текущую сессию")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()
                    }
                    .padding(.vertical, 16)
                    .padding(.horizontal, 18)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            )
        }
    }

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Оформление")

            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    iconBadge(
                        systemImage: container.appearanceMode.systemImage,
                        tint: Color(red: 0.40, green: 0.42, blue: 0.96)
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Тема приложения")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)

                        Text("Выбери, как должен выглядеть интерфейс.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()
                }

                Picker("Тема приложения", selection: appearanceBinding) {
                    ForEach(AppContainer.AppearanceMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }
            .padding(.vertical, 18)
            .padding(.horizontal, 18)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            )
        }
    }

    private var appearanceBinding: Binding<AppContainer.AppearanceMode> {
        Binding(
            get: { container.appearanceMode },
            set: { container.updateAppearanceMode($0) }
        )
    }

    private func heroChip(title: String, systemImage: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
            Text(title)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.white.opacity(0.14), in: Capsule())
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 4)
    }

    private func iconBadge(systemImage: String, tint: Color) -> some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(tint.opacity(0.14))
            .frame(width: 40, height: 40)
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(tint)
            }
    }

    private var backgroundView: some View {
        ZStack(alignment: .top) {
            Color(uiColor: .systemGroupedBackground)
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    Color(red: 0.80, green: 0.90, blue: 1.0),
                    Color(red: 0.94, green: 0.97, blue: 1.0),
                    Color(uiColor: .systemGroupedBackground)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 320)
            .ignoresSafeArea(edges: .top)

            Circle()
                .fill(Color.white.opacity(0.55))
                .frame(width: 220, height: 220)
                .blur(radius: 18)
                .offset(x: -120, y: -70)

            Circle()
                .fill(Color(red: 0.45, green: 0.78, blue: 1.0).opacity(0.18))
                .frame(width: 260, height: 260)
                .blur(radius: 24)
                .offset(x: 120, y: -90)
        }
    }

    private var contactValue: String {
        if let contact = viewModel.contact {
            return contact
        }
        return viewModel.isLoading ? "Загружаем контакт..." : "Контакт недоступен"
    }

    private var contactTitle: String {
        guard let contact = viewModel.contact else {
            return "Контакт аккаунта"
        }
        return contact.contains("@") ? "Email" : "Телефон"
    }

    private var contactIconName: String {
        guard let contact = viewModel.contact else {
            return "person.crop.circle.badge.questionmark"
        }
        return contact.contains("@") ? "envelope.fill" : "phone.fill"
    }

    private var currentProfile: (userID: UUID, displayName: String) {
        switch sessionStore.state {
        case .authenticated(_, let userID, let displayName):
            return (userID, displayName)
        case .unauthenticated:
            return (SessionStore.Constants.currentUserID, SessionStore.Constants.currentUserDisplayName)
        }
    }

    private func initials(from displayName: String) -> String {
        let words = displayName.split(separator: " ")
        if let first = words.first, let second = words.dropFirst().first {
            return String(first.prefix(1)) + String(second.prefix(1))
        }
        return String(displayName.prefix(2)).uppercased()
    }

    private func shortID(from userID: UUID) -> String {
        String(userID.uuidString.prefix(8)).uppercased()
    }
}

private struct ProfileSection<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            VStack(spacing: 0) {
                content
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            )
        }
    }
}

private struct ProfileInfoRow: View {
    let systemImage: String
    let tint: Color
    let value: String
    let title: String
    let isMonospaced: Bool

    var body: some View {
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
                Group {
                    if isMonospaced {
                        Text(value)
                            .font(.system(.footnote, design: .monospaced))
                    } else {
                        Text(value)
                            .font(.body.weight(.semibold))
                    }
                }
                .foregroundStyle(.primary)
                .lineLimit(isMonospaced ? 3 : 2)
                .multilineTextAlignment(.leading)

                Text(title)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 18)
    }
}
