import SwiftUI

struct ChatListView: View {
    @StateObject private var viewModel: ChatListViewModel
    @State private var isShowingCreateOptions = false
    @State private var activeCreateSheet: CreateChatSheetKind?
    @State private var createdChat: ChatListItem?
    @State private var pendingDeletionChat: ChatListItem?

    private enum CreateChatSheetKind: Identifiable {
        case direct
        case group

        var id: Int {
            switch self {
            case .direct: return 0
            case .group: return 1
            }
        }
    }

    @MainActor
    init() {
        self.init(container: .shared)
    }

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeChatListViewModel())
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ChatListBackdrop()

                ScrollView {
                    VStack(spacing: 18) {
                        ChatListHero(
                            chatCount: viewModel.chats.count,
                            unreadCount: unreadCount,
                            onCreateTap: { isShowingCreateOptions = true }
                        )

                        ChatSearchField(text: $viewModel.searchQuery)

                        if viewModel.isLoading {
                            LazyVStack(spacing: 14) {
                                ForEach(0..<5, id: \.self) { _ in
                                    ChatRowSkeleton()
                                }
                            }
                        } else if viewModel.chats.isEmpty {
                            ChatListEmptyState(
                                searchQuery: viewModel.searchQuery,
                                onCreateTap: { isShowingCreateOptions = true }
                            )
                        } else {
                            LazyVStack(spacing: 14) {
                                ForEach(Array(viewModel.chats.enumerated()), id: \.element.id) { index, chat in
                                    NavigationLink(value: chat) {
                                        ChatRowView(
                                            chat: chat,
                                            accent: accentColor(for: index),
                                            isDeleting: viewModel.deletingChatID == chat.id
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button {
                                            createdChat = chat
                                        } label: {
                                            Label("Открыть", systemImage: "bubble.left.and.bubble.right")
                                        }

                                        Button(role: .destructive) {
                                            pendingDeletionChat = chat
                                        } label: {
                                            Label("Удалить чат", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .contentMargins(.horizontal, 18, for: .scrollContent)
                .background(Color.clear)
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await viewModel.refresh() }
                .navigationDestination(item: $createdChat) { chat in
                    DialogueView(chat: chat)
                }
                .navigationDestination(for: ChatListItem.self) { chat in
                    DialogueView(chat: chat)
                }
                .toolbar(.hidden, for: .navigationBar)
                .confirmationDialog("Новый чат", isPresented: $isShowingCreateOptions, titleVisibility: .visible) {
                    Button("Личный чат") { activeCreateSheet = .direct }
                    Button("Групповой чат") { activeCreateSheet = .group }
                    Button("Отмена", role: .cancel) { activeCreateSheet = nil }
                }
                .sheet(item: $activeCreateSheet) { kind in
                    switch kind {
                    case .direct:
                        CreateDirectChatSheet(
                            viewModel: viewModel,
                            onClose: { activeCreateSheet = nil }
                        ) { contact in
                            if let chat = await viewModel.createDirectChat(with: contact) {
                                createdChat = chat
                                activeCreateSheet = nil
                            }
                        }
                    case .group:
                        CreateGroupChatSheet(
                            onClose: { activeCreateSheet = nil },
                            viewModel: viewModel
                        ) { title, participantContacts in
                            if let chat = await viewModel.createChat(title: title, participantContacts: participantContacts) {
                                createdChat = chat
                                activeCreateSheet = nil
                            }
                        }
                    }
                }
                .alert(
                    "Удалить чат?",
                    isPresented: Binding(
                        get: { pendingDeletionChat != nil },
                        set: { if !$0 { pendingDeletionChat = nil } }
                    ),
                    presenting: pendingDeletionChat
                ) { chat in
                    Button("Удалить", role: .destructive) {
                        Task {
                            await viewModel.deleteChat(chat)
                            pendingDeletionChat = nil
                        }
                    }
                    Button("Отмена", role: .cancel) {
                        pendingDeletionChat = nil
                    }
                } message: { chat in
                    Text("Чат «\(chat.title)» будет удалён из списка.")
                }
                .overlay(alignment: .top) {
                    if viewModel.isShowingError, let errorMessage = viewModel.errorMessage {
                        BannerView(message: errorMessage)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                    }
                }
                .task { viewModel.onAppear() }
            }
        }
    }

    private var unreadCount: Int {
        viewModel.chats.reduce(0) { $0 + $1.unreadCount }
    }

    private func accentColor(for index: Int) -> Color {
        let palette: [Color] = [
            Color.blue,
            Color.cyan,
            Color.teal,
            Color.indigo
        ]
        return palette[index % palette.count]
    }
}

private struct ChatListHero: View {
    let chatCount: Int
    let unreadCount: Int
    let onCreateTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Чаты")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(.primary)

                    Text(heroSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 16)

                Button(action: onCreateTap) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color.blue.opacity(0.95), Color.cyan.opacity(0.82)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )

                        Image(systemName: "person.3.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 56, height: 56)
                    .shadow(color: Color.blue.opacity(0.18), radius: 18, x: 0, y: 12)
                }
                .accessibilityLabel("Создать групповой чат")
            }

            HStack(spacing: 12) {
                HeroChip(
                    title: "\(chatCount)",
                    subtitle: String.localizedStringWithFormat("чатов: %d", chatCount),
                    accent: Color.blue
                )

                HeroChip(
                    title: "\(unreadCount)",
                    subtitle: unreadCount == 0 ? "без непрочитанных" : "непрочитанных",
                    accent: unreadCount == 0 ? Color.secondary : Color.cyan
                )
            }
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.55), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.06), radius: 22, x: 0, y: 12)
        .padding(.top, 8)
    }

    private var heroSubtitle: String {
        unreadCount > 0
        ? "Новые сообщения уже ждут ответа"
        : "Все диалоги, группы и быстрый доступ в одном месте"
    }
}

private struct HeroChip: View {
    let title: String
    let subtitle: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(.primary)

            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct ChatSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.secondary)

            TextField("Поиск чатов", text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            if !text.isEmpty {
                Button(action: { text = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .font(.title3.weight(.medium))
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.62))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.6), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.04), radius: 12, x: 0, y: 8)
    }
}

private struct ChatListEmptyState: View {
    let searchQuery: String
    let onCreateTap: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.12))
                    .frame(width: 82, height: 82)

                Image(systemName: searchQuery.isEmpty ? "bubble.left.and.bubble.right.fill" : "magnifyingglass")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(Color.blue.opacity(0.9))
            }

            Text(searchQuery.isEmpty ? "Чаты появятся здесь" : "Ничего не найдено")
                .font(.title3.weight(.semibold))

            Text(
                searchQuery.isEmpty
                ? "Начните личный диалог из контактов или соберите новый групповой чат."
                : "Попробуйте изменить запрос или очистить поиск, чтобы увидеть все диалоги."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)

            if searchQuery.isEmpty {
                Button(action: onCreateTap) {
                    Text("Создать групповой чат")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .background(
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [Color.blue, Color.cyan],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                        )
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 28)
        .padding(.vertical, 36)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.55), lineWidth: 1)
        }
    }
}

private struct ChatRowView: View {
    let chat: ChatListItem
    let accent: Color
    let isDeleting: Bool

    var body: some View {
        HStack(spacing: 16) {
            avatar

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    Text(chat.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Spacer(minLength: 8)

                    VStack(alignment: .trailing, spacing: 8) {
                        Text(chat.relativeDateString)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)

                        if chat.unreadCount > 0 {
                            Text("\(chat.unreadCount)")
                                .font(.footnote.bold())
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(accent))
                        }
                    }
                }

                HStack(spacing: 8) {
                    ChatMetaTag(
                        title: chat.isGroup ? "Группа" : "Личный чат",
                        tint: accent.opacity(chat.isGroup ? 0.95 : 0.78)
                    )

                    if let participants = chat.participantsSummary {
                        Text(participants)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                if !chat.typingParticipants.isEmpty {
                    Text("Печатает: \(chat.typingParticipants.joined(separator: ", "))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(accent)
                        .lineLimit(2)
                } else if let preview = chat.lastMessagePreview, !preview.isEmpty {
                    Text(preview)
                        .font(.subheadline.weight(chat.unreadCount > 0 ? .semibold : .regular))
                        .foregroundStyle(chat.unreadCount > 0 ? .primary : .secondary)
                        .lineLimit(2)
                } else {
                    Text(chat.isGroup ? "Групповой чат готов к общению" : "Напишите первое сообщение")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    }
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.secondary.opacity(0.65))
        }
        .opacity(isDeleting ? 0.55 : 1)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.5), lineWidth: 1)
        }
        .shadow(color: accent.opacity(0.08), radius: 22, x: 0, y: 12)
    }

    private var avatar: some View {
        ZStack {
            if chat.isGroup {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [accent.opacity(0.95), accent.opacity(0.58), Color.white.opacity(0.65)],
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
                            colors: [Color.white.opacity(0.95), Color.blue.opacity(0.18)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Text(chat.initials)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(accent.opacity(0.92))
            }
        }
        .frame(width: 62, height: 62)
    }
}

private struct ChatMetaTag: View {
    let title: String
    let tint: Color

    var body: some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(tint.opacity(0.12)))
            .foregroundStyle(tint)
    }
}

private struct ChatRowSkeleton: View {
    var body: some View {
        HStack(spacing: 18) {
            SkeletonView(isActive: true)
                .frame(width: 62, height: 62)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(width: 170, height: 18)
                    .clipShape(Capsule())
                SkeletonView(isActive: true)
                    .frame(width: 220, height: 13)
                    .clipShape(Capsule())
            }
            Spacer()
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white.opacity(0.45))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.45), lineWidth: 1)
        }
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
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct CreateGroupChatSheet: View {
    let onClose: () -> Void
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
                    Button("Отмена") { onClose() }
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

private struct CreateDirectChatSheet: View {
    @ObservedObject var viewModel: ChatListViewModel
    let onClose: () -> Void
    let onCreate: (ContactDTO) async -> Void

    @State private var searchQuery: String = ""
    @State private var selectedContactID: UUID?

    private var filteredContacts: [ContactDTO] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return viewModel.availableContacts }

        return viewModel.availableContacts.filter { contact in
            contact.displayName.lowercased().contains(query) ||
            contact.contact.lowercased().contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ChatListBackdrop()

                List {
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Новый личный чат")
                                .font(.title3.weight(.semibold))
                            Text("Выберите одного контакта. Если чат уже есть, откроется существующий диалог.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)
                        .listRowBackground(Color.clear)
                    }

                    Section("Контакты") {
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
                            Text(searchQuery.isEmpty ? "Нет доступных контактов" : "Ничего не найдено")
                                .foregroundStyle(.secondary)
                                .padding(.vertical, 6)
                        } else {
                            ForEach(filteredContacts) { contact in
                                Button {
                                    selectedContactID = contact.userID
                                } label: {
                                    GroupContactRow(
                                        contact: contact,
                                        isSelected: selectedContactID == contact.userID
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
            }
            .navigationTitle("Личный чат")
            .searchable(text: $searchQuery, prompt: "Поиск контактов")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Открыть") {
                        guard let selectedContact = viewModel.availableContacts.first(where: { $0.userID == selectedContactID }) else { return }
                        Task { await onCreate(selectedContact) }
                    }
                    .disabled(selectedContactID == nil || viewModel.isCreatingChat)
                }
            }
            .task {
                await viewModel.loadCreateContactsIfNeeded()
            }
        }
    }
}

private struct GroupContactRow: View {
    let contact: ContactDTO
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(Color.blue.opacity(isSelected ? 0.22 : 0.12))
                .frame(width: 44, height: 44)
                .overlay(
                    Text(initials)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.blue.opacity(0.9))
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
        .background(.thinMaterial, in: Capsule())
    }
}

private struct ChatListBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.94, green: 0.97, blue: 1.00),
                    Color(red: 0.89, green: 0.95, blue: 0.98),
                    Color(red: 0.96, green: 0.98, blue: 1.00)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color.white.opacity(0.55))
                .frame(width: 240, height: 240)
                .blur(radius: 10)
                .offset(x: 130, y: -250)

            Circle()
                .fill(Color.cyan.opacity(0.12))
                .frame(width: 280, height: 280)
                .offset(x: -150, y: 260)

            RoundedRectangle(cornerRadius: 48, style: .continuous)
                .fill(Color.blue.opacity(0.06))
                .frame(width: 220, height: 220)
                .rotationEffect(.degrees(18))
                .offset(x: 160, y: 240)
        }
        .ignoresSafeArea()
    }
}
