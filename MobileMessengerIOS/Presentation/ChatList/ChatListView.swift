import SwiftUI

struct ChatListView: View {
    @StateObject private var viewModel: ChatListViewModel
    @State private var isShowingCreateSheet = false
    @State private var createdChat: ChatListItem?
    @State private var isShowingArchived = false

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
                                .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                    Button {
                                        viewModel.togglePinned(for: chat.id)
                                    } label: {
                                        Label(chat.isPinned ? "Открепить" : "Закрепить", systemImage: chat.isPinned ? "pin.slash.fill" : "pin.fill")
                                    }
                                    .tint(.yellow)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button {
                                        viewModel.toggleMuted(for: chat.id)
                                    } label: {
                                        Label(chat.isMuted ? "Включить звук" : "Без звука", systemImage: chat.isMuted ? "bell.fill" : "bell.slash.fill")
                                    }
                                    .tint(.indigo)

                                    Button {
                                        viewModel.toggleArchived(for: chat.id)
                                    } label: {
                                        Label(chat.isArchived ? "Из архива" : "В архив", systemImage: chat.isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill")
                                    }
                                    .tint(.gray)
                                }
                                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                            }
                        }

                        if !viewModel.archivedChats.isEmpty {
                            Section {
                                Button {
                                    withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) {
                                        isShowingArchived.toggle()
                                    }
                                } label: {
                                    ArchivedChatsRow(
                                        count: viewModel.archivedChats.count,
                                        isExpanded: isShowingArchived
                                    )
                                }
                                .buttonStyle(.plain)
                                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)

                                if isShowingArchived {
                                    ForEach(viewModel.archivedChats) { chat in
                                        NavigationLink(value: chat) {
                                            ChatRowView(chat: chat)
                                        }
                                        .buttonStyle(.plain)
                                        .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                            Button {
                                                viewModel.togglePinned(for: chat.id)
                                            } label: {
                                                Label(chat.isPinned ? "Открепить" : "Закрепить", systemImage: chat.isPinned ? "pin.slash.fill" : "pin.fill")
                                            }
                                            .tint(.yellow)
                                        }
                                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                            Button {
                                                viewModel.toggleMuted(for: chat.id)
                                            } label: {
                                                Label(chat.isMuted ? "Включить звук" : "Без звука", systemImage: chat.isMuted ? "bell.fill" : "bell.slash.fill")
                                            }
                                            .tint(.indigo)

                                            Button {
                                                viewModel.toggleArchived(for: chat.id)
                                            } label: {
                                                Label("Из архива", systemImage: "tray.and.arrow.up.fill")
                                            }
                                            .tint(.gray)
                                        }
                                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                        .listRowBackground(Color.clear)
                                        .listRowSeparator(.hidden)
                                    }
                                }
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
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { isShowingCreateSheet = true }) {
                            Image(systemName: "person.3.sequence.fill")
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
                        BannerView(message: "Не удалось загрузить список чатов")
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                    }
                }
                .task { viewModel.onAppear() }
            }
        }
    }
}

private struct ChatRowView: View {
    let chat: ChatListItem

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
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
                            .background(Capsule().fill(Color.white.opacity(0.65)))
                            .foregroundStyle(Color.blue.opacity(0.9))
                    }

                    Spacer(minLength: 8)

                    VStack(alignment: .trailing, spacing: 8) {
                        Text(chat.relativeDateString)
                            .font(.caption)
                            .foregroundStyle(chat.unreadCount > 0 && !chat.isMuted ? Color.blue.opacity(0.95) : .secondary)
                            .multilineTextAlignment(.trailing)

                        HStack(spacing: 8) {
                            if chat.isPinned {
                                Image(systemName: "pin.fill")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            if chat.isMuted {
                                Image(systemName: "bell.slash.fill")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            if chat.unreadCount > 0 {
                                Text(chat.unreadBadgeText)
                                    .font(.footnote.bold())
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Capsule().fill(chat.isMuted ? Color.gray.opacity(0.8) : Color.blue))
                            }
                        }
                    }
                }

                if let participants = chat.participantsSummary {
                    Text(participants)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if chat.lastMessageIsOutgoing, let status = chat.lastMessageStatus {
                        MessageStatusView(status: status)
                            .font(.caption)
                    }

                    if !chat.typingParticipants.isEmpty {
                        Text(typingLabel)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.blue.opacity(0.9))
                            .lineLimit(2)
                    } else if !chat.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        (
                            Text("Черновик: ")
                                .foregroundStyle(Color.orange.opacity(0.92))
                            +
                            Text(chat.draftText)
                                .foregroundStyle(.secondary)
                        )
                        .font(.subheadline)
                        .lineLimit(2)
                    } else if let preview = chat.lastMessagePreview, !preview.isEmpty {
                        previewText(preview)
                            .font(.subheadline)
                            .lineLimit(2)
                    } else if chat.lastMessageKind == .image {
                        Text(chat.lastMessageIsOutgoing ? "Вы отправили фото" : "Фото")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(chat.isGroup ? "Групповой чат готов к общению" : "Напишите первое сообщение")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.45), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.06), radius: 16, x: 0, y: 10)
    }

    @ViewBuilder
    private func previewText(_ preview: String) -> some View {
        if chat.isGroup, let sender = chat.lastMessageAuthorName, !chat.lastMessageIsOutgoing {
            (
                Text("\(sender): ")
                    .foregroundStyle(.primary)
                +
                Text(preview)
                    .foregroundStyle(.secondary)
            )
        } else {
            Text(preview)
                .foregroundStyle(.secondary)
        }
    }

    private var typingLabel: String {
        if chat.typingParticipants.count == 1 {
            return "\(chat.typingParticipants[0]) печатает..."
        }
        return "Печатают: \(chat.typingParticipants.joined(separator: ", "))"
    }

    private var avatar: some View {
        ZStack {
            if chat.isGroup {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color.blue.opacity(0.85), Color.cyan.opacity(0.75)],
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
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.blue.opacity(0.85))
            }
        }
        .frame(width: 54, height: 54)
        .overlay(alignment: .bottomTrailing) {
            if chat.isPinned {
                Image(systemName: "pin.fill")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(5)
                    .background(Color.yellow.opacity(0.95), in: Circle())
            }
        }
    }
}

private struct ArchivedChatsRow: View {
    let count: Int
    let isExpanded: Bool

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.55))
                .frame(width: 54, height: 54)
                .overlay {
                    Image(systemName: "archivebox.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.secondary)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text("Архив")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)

                Text("\(count) чатов")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.42))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.45), lineWidth: 1)
        }
    }
}

private extension ChatListItem {
    var unreadBadgeText: String {
        unreadCount > 99 ? "99+" : "\(unreadCount)"
    }
}

private struct ChatRowSkeleton: View {
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
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.45))
        )
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
