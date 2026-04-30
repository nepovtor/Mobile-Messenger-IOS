import SwiftUI

@MainActor
final class ContactsViewModel: ObservableObject {
    @Published private(set) var contacts: [ContactDTO] = []
    @Published var searchQuery: String = ""
    @Published var addPhone = ""
    @Published var isLoading = false
    @Published var isAdding = false
    @Published var removingContactID: UUID?
    @Published var errorMessage: String?
    @Published private(set) var successMessage: String?
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
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return contacts }

        return contacts.filter { contact in
            contact.displayName.lowercased().contains(query) ||
            contact.contact.lowercased().contains(query)
        }
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
            successMessage = nil
        } catch {
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_load")
        }
    }

    func addContact() async {
        let trimmedPhone = addPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedPhone.isEmpty else {
            errorMessage = "Введите номер телефона."
            successMessage = nil
            return
        }
        guard !isAdding else { return }

        isAdding = true
        defer { isAdding = false }

        do {
            let contact = try await contactsService.addContact(phone: trimmedPhone)
            if let existingIndex = contacts.firstIndex(where: { $0.id == contact.id }) {
                contacts[existingIndex] = contact
            } else if contact.alreadyExists != true {
                contacts.insert(contact, at: 0)
            }
            addPhone = ""
            errorMessage = nil
            successMessage = contact.alreadyExists == true
                ? "Контакт уже добавлен."
                : "Контакт добавлен."
            if contact.alreadyExists == true, !contacts.contains(where: { $0.id == contact.id }) {
                contacts.insert(contact, at: 0)
            }
        } catch {
            successMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_add")
        }
    }

    func removeContact(_ contact: ContactDTO) async {
        guard removingContactID == nil else { return }
        removingContactID = contact.id
        defer { removingContactID = nil }

        do {
            try await contactsService.removeContact(id: contact.id)
            contacts.removeAll { $0.id == contact.id }
            errorMessage = nil
            successMessage = "Контакт удалён."
        } catch {
            successMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_remove")
        }
    }

    func openChat(with contact: ContactDTO) async -> ChatListItem? {
        guard openingContactID == nil else { return nil }

        openingContactID = contact.userID
        defer { openingContactID = nil }

        do {
            let chat = try await createChatUseCase(
                title: contact.displayName,
                participantContacts: [contact.contact]
            )
            errorMessage = nil
            return ChatListItem(
                id: chat.id,
                title: chat.title,
                lastMessagePreview: chat.lastMessagePreview,
                updatedAt: chat.lastActivity,
                unreadCount: chat.unreadCount,
                typingParticipants: chat.typingParticipants,
                participantNames: chat.participantNames,
                participantCount: chat.participantCount
            )
        } catch {
            successMessage = nil
            errorMessage = AppError.presentableMessage(for: error)
            analytics.track(error: error, context: "contacts_open_chat")
            return nil
        }
    }
}

struct ContactsView: View {
    @StateObject private var viewModel: ContactsViewModel
    @State private var openedChat: ChatListItem?

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeContactsViewModel())
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Добавить контакт")
                            .font(.headline)
                        TextField("+375291234567", text: $viewModel.addPhone)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                            .autocorrectionDisabled()

                        Button {
                            Task {
                                await viewModel.addContact()
                            }
                        } label: {
                            HStack {
                                if viewModel.isAdding {
                                    ProgressView()
                                }
                                Text("Добавить")
                            }
                        }
                        .disabled(viewModel.isAdding)
                    }
                    .padding(.vertical, 4)
                }

                if viewModel.isLoading && viewModel.contacts.isEmpty {
                    Section {
                        ForEach(0..<5, id: \.self) { _ in
                            ContactRowSkeleton()
                        }
                    }
                } else if viewModel.filteredContacts.isEmpty {
                    Section {
                        ContentUnavailableView(
                            "Контактов пока нет",
                            systemImage: "person.2.slash",
                            description: Text("Добавьте пользователя по номеру телефона, чтобы быстро открыть direct chat.")
                        )
                    }
                } else {
                    Section {
                        ForEach(viewModel.filteredContacts) { contact in
                            Button {
                                Task {
                                    if let chat = await viewModel.openChat(with: contact) {
                                        openedChat = chat
                                    }
                                }
                            } label: {
                                ContactRow(
                                    contact: contact,
                                    isOpening: viewModel.openingContactID == contact.userID
                                )
                            }
                            .buttonStyle(.plain)
                            .disabled(viewModel.openingContactID == contact.userID)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.removeContact(contact)
                                    }
                                } label: {
                                    if viewModel.removingContactID == contact.id {
                                        ProgressView()
                                    } else {
                                        Label("Удалить", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Контакты")
            .searchable(text: $viewModel.searchQuery, prompt: "Поиск контактов")
            .refreshable { await viewModel.refresh() }
            .navigationDestination(item: $openedChat) { chat in
                DialogueView(chat: chat)
            }
            .overlay(alignment: .top) {
                if let successMessage = viewModel.successMessage {
                    BannerMessageView(
                        message: successMessage,
                        systemImage: "checkmark.circle.fill",
                        tint: .green
                    )
                    .padding()
                } else if let errorMessage = viewModel.errorMessage {
                    BannerMessageView(
                        message: errorMessage,
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        tint: .red
                    )
                        .padding()
                }
            }
            .task { viewModel.onAppear() }
        }
    }
}

private struct ContactRow: View {
    let contact: ContactDTO
    let isOpening: Bool

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(Color.blue.opacity(0.2))
                .frame(width: 48, height: 48)
                .overlay(
                    Text(initials)
                        .font(.headline)
                        .foregroundStyle(.blue)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(contact.displayName)
                    .font(.headline)
                Text(contact.phone)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(contact.directChatID == nil ? "Direct chat создастся автоматически" : "Нажмите, чтобы открыть диалог")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if isOpening {
                ProgressView()
            } else {
                Image(systemName: "message.fill")
                    .foregroundStyle(.blue)
            }
        }
        .padding(.vertical, 8)
    }

    private var initials: String {
        let words = contact.displayName.split(separator: " ")
        if let first = words.first, let second = words.dropFirst().first {
            return String(first.prefix(1)) + String(second.prefix(1))
        }
        return String(contact.displayName.prefix(2))
    }
}

private struct ContactRowSkeleton: View {
    var body: some View {
        HStack(spacing: 14) {
            SkeletonView(isActive: true)
                .frame(width: 48, height: 48)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(height: 16)
                SkeletonView(isActive: true)
                    .frame(height: 12)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct BannerMessageView: View {
    let message: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack {
            Image(systemName: systemImage)
            Text(message)
                .font(.footnote)
            Spacer()
        }
        .padding()
        .foregroundStyle(tint)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct MainTabView: View {
    @ObservedObject private var container: AppContainer

    init(container: AppContainer) {
        self.container = container
    }

    var body: some View {
        TabView {
            ContactsView(container: container)
                .tabItem {
                    Label("Контакты", systemImage: "person.2")
                }

            ChatListView(container: container)
                .tabItem {
                    Label("Чаты", systemImage: "message")
                }

            ProfileView(container: container)
                .tabItem {
                    Label("Профиль", systemImage: "person.crop.circle")
                }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Spacer()
                ConnectionStatusBadge(status: container.connectionStatus)
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 2)
        }
        .task {
            await PushNotificationManager.shared.registerForNotifications()
        }
    }
}

private struct ConnectionStatusBadge: View {
    let status: AppContainer.ConnectionStatus

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(accentColor)
                .frame(width: 8, height: 8)

            Text(label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.black.opacity(0.78))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        }
        .foregroundStyle(.white)
        .shadow(color: Color.black.opacity(0.16), radius: 10, x: 0, y: 6)
    }

    private var accentColor: Color {
        switch status {
        case .online:
            return Color.green
        case .connecting:
            return Color.blue
        case .reconnecting:
            return Color.orange
        case .offline:
            return Color.red
        }
    }

    private var label: String {
        switch status {
        case .online:
            return "Онлайн"
        case .connecting:
            return "Подключение"
        case .reconnecting:
            return "Переподключение"
        case .offline:
            return "Оффлайн"
        }
    }
}
