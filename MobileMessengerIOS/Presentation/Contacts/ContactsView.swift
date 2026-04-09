import SwiftUI

private struct ContactChatRoute: Hashable {
    let chatID: UUID
    let title: String
}

@MainActor
public final class ContactsViewModel: ObservableObject {
    @Published private(set) var contacts: [ContactDTO] = []
    @Published var searchQuery: String = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var openingContactID: UUID?

    private let contactsService: ContactsNetworking
    private let createChatUseCase: CreateChatUseCase
    private let analytics: AnalyticsService
    private var hasLoaded = false

    init(contactsService: ContactsNetworking, createChat: CreateChatUseCase, analytics: AnalyticsService) {
        self.contactsService = contactsService
        self.createChatUseCase = createChat
        self.analytics = analytics
    }

    var filteredContacts: [ContactDTO] {
        let trimmedQuery = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmedQuery.isEmpty else { return contacts }

        return contacts.filter { contact in
            contact.displayName.lowercased().contains(trimmedQuery) ||
            contact.phone.lowercased().contains(trimmedQuery)
        }
    }

    var availableContactsCount: Int {
        contacts.filter { !$0.isCurrentUser }.count
    }

    func onAppear() {
        guard !hasLoaded else { return }
        hasLoaded = true
        Task { await refresh() }
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            contacts = try await contactsService.listContacts()
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            analytics.track(error: error, context: "contacts_load")
        }
    }

    fileprivate func openChat(with contact: ContactDTO) async -> ContactChatRoute? {
        guard !contact.isCurrentUser else {
            errorMessage = AppLanguagePreference.localized(ru: "Нельзя открыть чат с собственным аккаунтом", en: "You can't open a chat with your own account")
            return nil
        }
        guard openingContactID == nil else { return nil }

        openingContactID = contact.userID
        defer { openingContactID = nil }

        do {
            let chat = try await createChatUseCase(title: contact.displayName, participantIDs: [contact.userID], isDirect: true)
            errorMessage = nil
            return ContactChatRoute(chatID: chat.id, title: chat.title)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            analytics.track(error: error, context: "contacts_open_chat")
            return nil
        }
    }
}

struct ContactsView: View {
    @StateObject private var viewModel: ContactsViewModel
    @State private var navigationPath = NavigationPath()
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

    @MainActor
    init(container: AppContainer? = nil) {
        let container = container ?? .shared
        _viewModel = StateObject(wrappedValue: container.makeContactsViewModel())
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(uiColor: .systemGroupedBackground),
                        Color.green.opacity(0.05),
                        Color(uiColor: .systemBackground)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        header

                        if let errorMessage = viewModel.errorMessage {
                            BannerView(message: errorMessage)
                                .padding(.horizontal, 20)
                        }

                        content
                            .padding(.horizontal, 20)
                            .padding(.bottom, 28)
                    }
                }
                .refreshable { await viewModel.refresh() }
            }
            .navigationDestination(for: ContactChatRoute.self) { route in
                DialogueView(chatID: route.chatID, title: route.title)
            }
            .searchable(text: $viewModel.searchQuery, prompt: t("Поиск контактов", "Search contacts"))
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { viewModel.onAppear() }
    }

    private var header: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    Color(red: 0.08, green: 0.63, blue: 0.52),
                    Color(red: 0.06, green: 0.55, blue: 0.78),
                    Color(red: 0.00, green: 0.48, blue: 1.00)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(Color.white.opacity(0.14))
                    .frame(width: 170, height: 170)
                    .offset(x: 40, y: -40)
            }

            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(t("Контакты", "Contacts"))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                    Text(t("Пять demo-аккаунтов для быстрого входа с двух симуляторов и живой переписки.", "Five demo accounts for quick sign-in across two simulators and live conversations."))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.white.opacity(0.86))
                }

                HStack(spacing: 12) {
                    StatChip(title: t("Всего", "Total"), value: "\(viewModel.contacts.count)")
                    StatChip(title: t("Доступно", "Available"), value: "\(viewModel.availableContactsCount)")
                }
            }
            .padding(24)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.contacts.isEmpty {
            VStack(spacing: 14) {
                ForEach(0..<5, id: \.self) { _ in
                    ContactRowSkeleton()
                }
            }
        } else if viewModel.filteredContacts.isEmpty {
            EmptyChatStateView(
                title: t("Контакты не найдены", "No contacts found"),
                subtitle: viewModel.searchQuery.isEmpty
                    ? t("В backend уже подготовлены demo-пользователи. Если список пуст, проверьте локальный сервер.", "Demo users are already seeded in the backend. If the list is empty, check your local server.")
                    : t("Попробуйте другой запрос или очистите поиск.", "Try another query or clear the search.")
            )
        } else {
            LazyVStack(spacing: 14) {
                ForEach(viewModel.filteredContacts) { contact in
                    ContactRowView(
                        contact: contact,
                        language: language,
                        isOpening: viewModel.openingContactID == contact.userID
                    ) {
                        Task {
                            if let route = await viewModel.openChat(with: contact) {
                                navigationPath.append(route)
                            }
                        }
                    }
                }
            }
        }
    }

    private var language: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }

    private func t(_ ru: String, _ en: String) -> String {
        language.text(ru: ru, en: en)
    }
}

private struct ContactRowView: View {
    let contact: ContactDTO
    let language: AppLanguagePreference
    let isOpening: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                avatar

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(contact.displayName)
                            .font(.headline)
                            .foregroundStyle(.primary)

                        if contact.isCurrentUser {
                            Text(language.text(ru: "Вы", en: "You"))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(Color.green))
                        }
                    }

                    Text(contact.phone)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Text("Demo")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(contact.isCurrentUser ? .green : .blue)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill((contact.isCurrentUser ? Color.green : Color.blue).opacity(0.12))
                        )

                    Text(contact.isCurrentUser
                         ? language.text(ru: "Этот аккаунт уже открыт на текущем устройстве.", en: "This account is already active on this device.")
                         : language.text(ru: "Нажмите, чтобы открыть личный диалог.", en: "Tap to open a direct conversation."))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 12)

                if contact.isCurrentUser {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.green)
                } else if isOpening {
                    ProgressView()
                } else {
                    Image(systemName: "bubble.left.and.text.bubble.right.fill")
                        .font(.title3)
                        .foregroundStyle(.blue)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.black.opacity(0.04), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.05), radius: 14, y: 8)
        }
        .buttonStyle(.plain)
        .disabled(contact.isCurrentUser || isOpening)
    }

    private var avatar: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: avatarColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 56, height: 56)
            .overlay(
                ZStack {
                    Circle()
                        .strokeBorder(Color.white.opacity(0.28), lineWidth: 1)

                    Text(initials)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                }
            )
    }

    private var initials: String {
        let words = contact.displayName.split(separator: " ")
        if let first = words.first, let second = words.dropFirst().first {
            return String(first.prefix(1)) + String(second.prefix(1))
        }
        return String(contact.displayName.prefix(2))
    }

    private var avatarColors: [Color] {
        let palettes: [[Color]] = [
            [Color(red: 0.08, green: 0.63, blue: 0.52), Color(red: 0.00, green: 0.48, blue: 1.00)],
            [Color(red: 0.97, green: 0.53, blue: 0.16), Color(red: 0.95, green: 0.31, blue: 0.27)],
            [Color(red: 0.56, green: 0.35, blue: 0.96), Color(red: 0.18, green: 0.40, blue: 0.96)],
            [Color(red: 0.16, green: 0.64, blue: 0.79), Color(red: 0.15, green: 0.80, blue: 0.52)],
            [Color(red: 0.95, green: 0.41, blue: 0.63), Color(red: 0.99, green: 0.69, blue: 0.26)]
        ]

        let index = abs(contact.phone.hashValue) % palettes.count
        return palettes[index]
    }
}

private struct ContactRowSkeleton: View {
    var body: some View {
        HStack(spacing: 16) {
            SkeletonView(isActive: true)
                .frame(width: 56, height: 56)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(height: 16)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                SkeletonView(isActive: true)
                    .frame(width: 160, height: 12)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                SkeletonView(isActive: true)
                    .frame(width: 220, height: 10)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct EmptyChatStateView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 34))
                .foregroundStyle(.blue)

            Text(title)
                .font(.headline)

            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.vertical, 38)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct BannerView: View {
    let message: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(.white)
            Text(message)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.orange, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct StatChip: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.white.opacity(0.74))

            Text(value)
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
