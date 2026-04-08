import SwiftUI

@MainActor
struct ChatListView: View {
    @StateObject private var viewModel: ChatListViewModel
    @State private var isShowingCreateSheet = false
    @State private var navigationPath = NavigationPath()
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

    @MainActor
    init(container: AppContainer? = nil) {
        let container = container ?? .shared
        _viewModel = StateObject(wrappedValue: container.makeChatListViewModel())
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
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
                        header

                        LazyVStack(spacing: 14) {
                            if viewModel.isLoading {
                                ForEach(0..<5, id: \.self) { _ in
                                    ChatRowSkeleton()
                                }
                            } else if viewModel.chats.isEmpty {
                                EmptyChatStateView(
                                    title: t("Чаты не найдены", "No chats found"),
                                    subtitle: viewModel.searchQuery.isEmpty
                                        ? t("Создайте первый диалог и начните общение.", "Create your first conversation and start chatting.")
                                        : t("Попробуйте изменить запрос или очистить поиск.", "Try another query or clear the search field.")
                                )
                            } else {
                                ForEach(viewModel.chats) { chat in
                                    NavigationLink(value: chat) {
                                        ChatRowView(chat: chat, language: language)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 28)
                    }
                }
                .refreshable { await viewModel.refresh() }
                .overlay(alignment: .top) {
                    if viewModel.isShowingError {
                        BannerView(message: t("Не удалось загрузить список чатов", "Failed to load chats"))
                            .padding(.top, 8)
                            .padding(.horizontal, 20)
                    }
                }
            }
            .navigationDestination(for: ChatListItem.self) { chat in
                DialogueView(chatID: chat.id, title: chat.title)
            }
            .searchable(text: $viewModel.searchQuery, prompt: t("Поиск чатов", "Search chats"))
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $isShowingCreateSheet) {
                CreateChatSheet(isPresented: $isShowingCreateSheet, viewModel: viewModel) { createdChat in
                    navigationPath.append(createdChat)
                }
            }
        }
        .task { viewModel.onAppear() }
        .onChange(of: languagePreference) { _, _ in
            Task { await viewModel.refresh() }
        }
    }

    private var header: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    Color(red: 0.00, green: 0.48, blue: 1.00),
                    Color(red: 0.24, green: 0.51, blue: 0.95),
                    Color(red: 0.35, green: 0.34, blue: 0.84)
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
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(t("Чаты", "Chats"))
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text(t("Быстрые диалоги, живые статусы и аккуратные карточки сообщений.", "Fast conversations, live statuses and polished message cards."))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.white.opacity(0.86))
                    }

                    Spacer()

                    Button(action: { isShowingCreateSheet = true }) {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(14)
                            .background(Color.white.opacity(0.18), in: Circle())
                    }
                }

                HStack(spacing: 12) {
                    StatChip(title: t("Всего", "Total"), value: "\(viewModel.chats.count)")
                    StatChip(title: t("Непрочитано", "Unread"), value: "\(viewModel.chats.reduce(0) { $0 + $1.unreadCount })")
                }
            }
            .padding(24)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private var language: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }

    private func t(_ ru: String, _ en: String) -> String {
        language.text(ru: ru, en: en)
    }
}

private struct ChatRowView: View {
    let chat: ChatListItem
    let language: AppLanguagePreference

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            avatar

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(chat.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Spacer(minLength: 12)
                    Text(chat.relativeDateString)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }

                if !chat.typingParticipants.isEmpty {
                    HStack(spacing: 8) {
                        TypingDotsView()
                        Text(language.text(ru: "Печатает: \(chat.typingParticipants.joined(separator: ", "))", en: "Typing: \(chat.typingParticipants.joined(separator: ", "))"))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.blue)
                    }
                } else if let preview = chat.lastMessagePreview {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                } else {
                    Text(language.text(ru: "Сообщений пока нет", en: "No messages yet"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if chat.unreadCount > 0 {
                    Text(language.text(ru: "\(chat.unreadCount) новых", en: "\(chat.unreadCount) new"))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.blue))
                }
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

    private var avatar: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 0.00, green: 0.48, blue: 1.00),
                        Color(red: 0.35, green: 0.34, blue: 0.84)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 56, height: 56)
            .overlay(
                Text(chat.initials)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
            )
    }
}

private struct EmptyChatStateView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.text.bubble.right")
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

private struct ChatRowSkeleton: View {
    var body: some View {
        HStack(spacing: 16) {
            SkeletonView(isActive: true)
                .frame(width: 56, height: 56)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(height: 16)
                SkeletonView(isActive: true)
                    .frame(height: 12)
                SkeletonView(isActive: true)
                    .frame(width: 70, height: 10)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
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
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct StatChip: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.medium))
                .foregroundStyle(Color.white.opacity(0.76))
            Text(value)
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct TypingDotsView: View {
    @State private var animate = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Color.blue.opacity(0.45 + (Double(index) * 0.15)))
                    .frame(width: 6, height: 6)
                    .offset(y: animate && index != 1 ? -2 : 2)
                    .animation(
                        .easeInOut(duration: 0.6)
                            .repeatForever()
                            .delay(Double(index) * 0.12),
                        value: animate
                    )
            }
        }
        .onAppear {
            animate = true
        }
    }
}

private struct CreateChatSheet: View {
    @Binding var isPresented: Bool
    @ObservedObject var viewModel: ChatListViewModel
    let onChatCreated: (ChatListItem) -> Void
    @State private var title: String = ""
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

    var body: some View {
        NavigationStack {
            Form {
                Section(t("Название", "Title")) {
                    TextField(t("Название чата", "Chat title"), text: $title)
                }

                if let error = viewModel.createChatErrorMessage {
                    Section {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                if viewModel.isCreatingChat {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text(t("Создаем чат...", "Creating chat..."))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle(t("Новый чат", "New chat"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Отмена", "Cancel")) { isPresented = false }
                        .disabled(viewModel.isCreatingChat)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(t("Создать", "Create")) {
                        Task {
                            if let createdChat = await viewModel.createChat(title: title) {
                                title = ""
                                isPresented = false
                                onChatCreated(createdChat)
                            }
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isCreatingChat)
                }
            }
            .onAppear {
                viewModel.clearCreateChatState()
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
