import SwiftUI

@MainActor
final class ContactsViewModel: ObservableObject {
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
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            analytics.track(error: error, context: "contacts_load")
        }
    }

    func openChat(with contact: ContactDTO) async -> ChatListItem? {
        guard !contact.isCurrentUser else {
            errorMessage = "Нельзя открыть чат с текущим аккаунтом"
            return nil
        }
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
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
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
                if viewModel.isLoading && viewModel.contacts.isEmpty {
                    Section {
                        ForEach(0..<5, id: \.self) { _ in
                            ContactRowSkeleton()
                        }
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
                            .disabled(contact.isCurrentUser || viewModel.openingContactID == contact.userID)
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
                if let errorMessage = viewModel.errorMessage {
                    BannerMessageView(message: errorMessage, systemImage: "person.crop.circle.badge.exclamationmark")
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
                .fill(contact.isCurrentUser ? Color.green.opacity(0.2) : Color.blue.opacity(0.2))
                .frame(width: 48, height: 48)
                .overlay(
                    Text(initials)
                        .font(.headline)
                        .foregroundStyle(contact.isCurrentUser ? .green : .blue)
                )

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(contact.displayName)
                        .font(.headline)
                    if contact.isCurrentUser {
                        Text("Вы")
                            .font(.caption.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.green.opacity(0.15)))
                            .foregroundStyle(.green)
                    }
                }
                Text(contact.contact)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(contact.isCurrentUser ? "Текущий аккаунт" : "Нажмите, чтобы открыть диалог")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if contact.isCurrentUser {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else if isOpening {
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

    var body: some View {
        HStack {
            Image(systemName: systemImage)
            Text(message)
                .font(.footnote)
            Spacer()
        }
        .padding()
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
        .overlay(alignment: .top) {
            ConnectionStatusBanner(status: container.connectionStatus)
                .padding(.horizontal, 16)
                .padding(.top, 8)
        }
        .task {
            await PushNotificationManager.shared.registerForNotifications()
        }
    }
}

private struct ConnectionStatusBanner: View {
    let status: AppContainer.ConnectionStatus

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: status.systemImage)
                .font(.headline)

            VStack(alignment: .leading, spacing: 2) {
                Text(status.title)
                    .font(.subheadline.weight(.semibold))
                Text(status.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(strokeColor, lineWidth: 1)
        }
        .foregroundStyle(foregroundColor)
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
    }

    private var strokeColor: Color {
        switch status {
        case .online:
            return Color.green.opacity(0.28)
        case .connecting:
            return Color.blue.opacity(0.24)
        case .reconnecting:
            return Color.orange.opacity(0.28)
        case .offline:
            return Color.red.opacity(0.24)
        }
    }

    private var foregroundColor: Color {
        switch status {
        case .online:
            return .green
        case .connecting:
            return .blue
        case .reconnecting:
            return .orange
        case .offline:
            return .red
        }
    }
}
