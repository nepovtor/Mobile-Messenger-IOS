import SwiftUI

struct ChatListView: View {
    @StateObject private var viewModel: ChatListViewModel
    @State private var isShowingCreateSheet = false
    @State private var createdChat: ChatListItem?
    @State private var pendingDeleteChat: ChatListItem?
    private let container: AppContainer

    @MainActor
    init() {
        self.init(container: .shared)
    }

    @MainActor
    init(container: AppContainer) {
        self.container = container
        _viewModel = StateObject(wrappedValue: container.makeChatListViewModel())
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ChatListBackdrop()

                List {
                    if viewModel.isLoading {
                        Section {
                            ForEach(0..<5, id: \.self) { _ in
                                ChatRowSkeleton()
                                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                            }
                        }
                    } else {
                        Section {
                            ForEach(viewModel.chats) { chat in
                                NavigationLink(value: chat) {
                                    ChatRowView(chat: chat)
                                }
                                .buttonStyle(.plain)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button("Удалить", role: .destructive) {
                                        pendingDeleteChat = chat
                                    }
                                }
                                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .refreshable { await viewModel.refresh() }
                .navigationDestination(item: $createdChat) { chat in
                    DialogueView(chat: chat)
                }
                .navigationDestination(for: ChatListItem.self) { chat in
                    DialogueView(chat: chat)
                }
                .searchable(text: $viewModel.searchQuery, prompt: "Поиск чатов")
                .navigationTitle("Чаты")
                .navigationBarTitleDisplayMode(.large)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: { isShowingCreateSheet = true }) {
                            Label("Новая группа", systemImage: "square.and.pencil")
                        }
                    }
                }
                .sheet(isPresented: $isShowingCreateSheet) {
                    CreateGroupChatSheet(
                        isPresented: $isShowingCreateSheet,
                        viewModel: viewModel
                    ) { title, participantContacts in
                        if let chat = await viewModel.createChat(title: title, participantContacts: participantContacts) {
                            createdChat = chat
                            isShowingCreateSheet = false
                        }
                    }
                }
                .overlay(alignment: .top) {
                    if viewModel.isShowingError {
                        BannerView(message: viewModel.errorMessage)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                    }
                }
                .task {
                    viewModel.onAppear()
                    openPendingPushChatIfPossible()
                }
                .onChange(of: viewModel.chats) { _, _ in
                    openPendingPushChatIfPossible()
                }
                .onChange(of: container.pendingPushChatID) { _, _ in
                    openPendingPushChatIfPossible()
                }
                .alert("Удалить чат?", isPresented: Binding(
                    get: { pendingDeleteChat != nil },
                    set: { isPresented in
                        if !isPresented {
                            pendingDeleteChat = nil
                        }
                    }
                )) {
                    Button("Отмена", role: .cancel) {
                        pendingDeleteChat = nil
                    }
                    Button("Удалить", role: .destructive) {
                        guard let pendingDeleteChat else { return }
                        Task {
                            let wasDeleted = await viewModel.deleteChat(pendingDeleteChat)
                            if wasDeleted {
                                container.consumePendingPushChatNavigation(for: pendingDeleteChat.id)
                            }
                        }
                        self.pendingDeleteChat = nil
                    }
                } message: {
                    Text("Чат исчезнет из вашего списка и вернётся, если в нём появятся новые сообщения.")
                }
            }
        }
    }

    private func openPendingPushChatIfPossible() {
        guard let chatID = container.pendingPushChatID,
              let chat = viewModel.chats.first(where: { $0.id == chatID }) else {
            return
        }

        createdChat = chat
        container.consumePendingPushChatNavigation(for: chatID)
    }
}

private struct ChatRowView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer

    let chat: ChatListItem

    var body: some View {
        HStack(spacing: 14) {
            avatar

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(chat.title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    if chat.isGroup {
                        Text("Группа")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(groupBadgeBackgroundColor))
                            .foregroundStyle(groupBadgeTextColor)
                    }

                    Spacer(minLength: 8)

                    Text(chat.relativeDateString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                }

                if let participants = chat.participantsSummary {
                    Text(participants)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if !chat.typingParticipants.isEmpty {
                    Text("Печатает: \(chat.typingParticipants.joined(separator: ", "))")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.primary.opacity(0.9))
                        .lineLimit(2)
                } else if let preview = chat.lastMessagePreview, !preview.isEmpty {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                } else {
                    Text(chat.isGroup ? "Групповой чат готов к общению" : "Напишите первое сообщение")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if chat.unreadCount > 0 {
                Text("\(chat.unreadCount)")
                    .font(.footnote.bold())
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(AppTheme.primary))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color(uiColor: .separator).opacity(0.16), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.10 : 0.04), radius: 8, y: 3)
    }

    private var avatar: some View {
        ZStack {
            if chat.isGroup {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [AppTheme.primary.opacity(0.85), AppTheme.aqua.opacity(0.75)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Image(systemName: "person.3.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
            } else {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: incomingAvatarColors,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Text(chat.initials)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(incomingAvatarTextColor)
            }
        }
        .frame(width: 54, height: 54)
    }

    private var cardBackgroundStyle: AnyShapeStyle {
        if isHighContrastDarkActive {
            return AnyShapeStyle(Color(uiColor: .secondarySystemBackground))
        }
        return AnyShapeStyle(Color(uiColor: .systemBackground).opacity(0.72))
    }

    private var cardBorderColor: Color {
        if isHighContrastDarkActive {
            return Color.white.opacity(0.14)
        }
        return Color.white.opacity(0.45)
    }

    private var groupBadgeBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color.blue.opacity(0.24)
        }
        return Color.white.opacity(0.65)
    }

    private var groupBadgeTextColor: Color {
        isHighContrastDarkActive ? .blue : AppTheme.primary.opacity(0.9)
    }

    private var incomingAvatarColors: [Color] {
        if isHighContrastDarkActive {
            return [Color.blue.opacity(0.28), Color.cyan.opacity(0.18)]
        }
        return [Color.white.opacity(0.95), AppTheme.primary.opacity(0.18)]
    }

    private var incomingAvatarTextColor: Color {
        isHighContrastDarkActive ? .white : AppTheme.primary.opacity(0.85)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct ChatRowSkeleton: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer

    var body: some View {
        HStack(spacing: 16) {
            SkeletonView(isActive: true)
                .frame(width: 54, height: 54)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(height: 16)
                    .clipShape(Capsule())
                SkeletonView(isActive: true)
                    .frame(height: 12)
                    .clipShape(Capsule())
            }
        }
        .padding(16)
        .liquidGlassCard(
            cornerRadius: 24,
            tint: Color.white,
            secondaryTint: AppTheme.aqua,
            innerDarkness: isHighContrastDarkActive ? 0.08 : 0
        )
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct BannerView: View {
    let message: String

    var body: some View {
        HStack {
            Image(systemName: "wifi.slash")
            Text(message)
                .font(.footnote)
            Spacer()
        }
        .padding()
        .liquidGlassCard(
            cornerRadius: 18,
            tint: .orange,
            secondaryTint: .white,
            innerDarkness: 0.08
        )
    }
}

private struct CreateGroupChatSheet: View {
    @Binding var isPresented: Bool
    @ObservedObject var viewModel: ChatListViewModel
    let onCreate: (String, [String]) async -> Void

    @State private var title: String = ""
    @State private var searchQuery: String = ""
    @State private var selectedContactIDs: Set<UUID> = []

    private var filteredContacts: [ContactDTO] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return viewModel.availableContacts }

        return viewModel.availableContacts.filter { contact in
            contact.displayName.lowercased().contains(query) ||
            contact.contact.lowercased().contains(query)
        }
    }

    private var selectedContacts: [ContactDTO] {
        viewModel.availableContacts.filter { selectedContactIDs.contains($0.userID) }
    }

    private var canCreate: Bool {
        !viewModel.isCreatingChat &&
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        selectedContactIDs.count >= 2
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ChatListBackdrop()

                List {
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Соберите группу")
                                .font(.title3.weight(.semibold))
                            Text("Выберите минимум двух собеседников, задайте название и откройте общий чат.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)
                        .listRowBackground(Color.clear)
                    }

                    Section("Название") {
                        TextField("Например, Команда iOS", text: $title)
                            .textInputAutocapitalization(.words)
                    }

                    if !selectedContacts.isEmpty {
                        Section("Выбрано: \(selectedContacts.count)") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(selectedContacts) { contact in
                                        SelectedContactChip(contact: contact) {
                                            selectedContactIDs.remove(contact.userID)
                                        }
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }

                    Section {
                        if viewModel.isLoadingCreateContacts {
                            HStack(spacing: 12) {
                                ProgressView()
                                Text("Загружаю контакты")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 6)
                        } else if let error = viewModel.createContactsError {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(error)
                                    .font(.subheadline)
                                Button("Повторить загрузку") {
                                    Task { await viewModel.loadCreateContactsIfNeeded(force: true) }
                                }
                            }
                            .padding(.vertical, 6)
                        } else if filteredContacts.isEmpty {
                            Text(searchQuery.isEmpty ? "Нет доступных контактов для группы" : "Ничего не найдено")
                                .foregroundStyle(.secondary)
                                .padding(.vertical, 6)
                        } else {
                            ForEach(filteredContacts) { contact in
                                Button {
                                    toggleSelection(for: contact)
                                } label: {
                                    GroupContactRow(
                                        contact: contact,
                                        isSelected: selectedContactIDs.contains(contact.userID)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    } header: {
                        Text("Участники")
                    } footer: {
                        Text("Для группового чата выберите минимум двух контактов.")
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
            }
            .navigationTitle("Новая группа")
            .searchable(text: $searchQuery, prompt: "Поиск контактов")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") {
                        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
                        let contacts = selectedContacts.map(\.contact)
                        Task { await onCreate(title, contacts) }
                    }
                    .disabled(!canCreate)
                }
            }
            .task {
                await viewModel.loadCreateContactsIfNeeded()
            }
        }
    }

    private func toggleSelection(for contact: ContactDTO) {
        if selectedContactIDs.contains(contact.userID) {
            selectedContactIDs.remove(contact.userID)
        } else {
            selectedContactIDs.insert(contact.userID)
        }
    }
}

private struct GroupContactRow: View {
    let contact: ContactDTO
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(AppTheme.primary.opacity(isSelected ? 0.22 : 0.12))
                .frame(width: 44, height: 44)
                .overlay(
                    Text(initials)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.primary.opacity(0.9))
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(contact.displayName)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(contact.contact)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(isSelected ? .blue : .secondary)
        }
        .contentShape(Rectangle())
    }

    private var initials: String {
        let words = contact.displayName.split(separator: " ")
        if let first = words.first, let second = words.dropFirst().first {
            return String(first.prefix(1)) + String(second.prefix(1))
        }
        return String(contact.displayName.prefix(2))
    }
}

private struct SelectedContactChip: View {
    let contact: ContactDTO
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(contact.displayName)
                .font(.footnote.weight(.medium))
                .lineLimit(1)

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .liquidGlassCapsule(
            tint: AppTheme.primary,
            secondaryTint: AppTheme.aqua,
            innerDarkness: 0.08
        )
    }
}

private struct ChatListBackdrop: View {
    var body: some View {
        Color(uiColor: .systemGroupedBackground)
            .ignoresSafeArea()
    }
}
