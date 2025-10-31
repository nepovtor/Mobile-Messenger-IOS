import SwiftUI

struct ChatListView: View {
    @StateObject private var viewModel: ChatListViewModel
    @State private var navigationPath: [ChatListItem] = []

    init(viewModel: ChatListViewModel = ChatListViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            List {
                if viewModel.filteredChats.isEmpty {
                    emptyState
                } else {
                    ForEach(viewModel.filteredChats) { chat in
                        Button {
                            navigationPath.append(chat)
                        } label: {
                            ChatRowView(chat: chat)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Чаты")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        if let chat = viewModel.createSampleChat() {
                            navigationPath = [chat]
                        }
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                    .accessibilityLabel("Создать новый чат")
                }
            }
            .searchable(text: $viewModel.searchQuery, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Поиск")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.prepare()
            }
            .navigationDestination(for: ChatListItem.self) { chat in
                DialogueView(viewModel: ChatViewModel(chatID: chat.id, chatTitle: chat.title))
                    .navigationTitle(chat.title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 42))
                .foregroundStyle(.secondary)
            Text("Здесь пока нет диалогов")
                .font(.headline)
            Text("Создайте новый чат или обновите список, чтобы увидеть последние переписки.")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Создать чат") {
                if let chat = viewModel.createSampleChat() {
                    navigationPath = [chat]
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .listRowBackground(Color.clear)
    }
}

private struct ChatRowView: View {
    let chat: ChatListItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.15))
                    .frame(width: 48, height: 48)
                Text(chat.initials.uppercased())
                    .font(.headline)
                    .foregroundStyle(.blue)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(chat.title)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Text(chat.relativeDateString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(chat.lastMessagePreview ?? "Нет сообщений")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if chat.unreadCount > 0 {
                Spacer(minLength: 8)
                Text("\(chat.unreadCount)")
                    .font(.caption.bold())
                    .foregroundStyle(.white)
                    .padding(.vertical, 4)
                    .padding(.horizontal, 8)
                    .background(Capsule().fill(Color.blue))
            }
        }
        .padding(.vertical, 6)
    }
}

#Preview {
    ChatListView(viewModel: ChatListViewModel())
}
