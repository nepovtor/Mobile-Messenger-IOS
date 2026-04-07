import SwiftUI

@MainActor
struct ChatListView: View {
    @StateObject private var viewModel: ChatListViewModel
    @State private var isShowingCreateSheet = false

    @MainActor
    init(container: AppContainer? = nil) {
        let container = container ?? .shared
        _viewModel = StateObject(wrappedValue: container.makeChatListViewModel())
    }

    var body: some View {
        NavigationStack {
            List {
                if viewModel.isLoading {
                    Section {
                        ForEach(0..<5, id: \.self) { _ in
                            ChatRowSkeleton()
                        }
                    }
                } else {
                    Section {
                        ForEach(viewModel.chats) { chat in
                            NavigationLink(value: chat) {
                                ChatRowView(chat: chat)
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.refresh() }
            .navigationDestination(for: ChatListItem.self) { chat in
                DialogueView(chatID: chat.id, title: chat.title)
            }
            .searchable(text: $viewModel.searchQuery, prompt: "Поиск чатов")
            .navigationTitle("Чаты")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { isShowingCreateSheet = true }) {
                        Image(systemName: "square.and.pencil")
                    }
                }
            }
            .sheet(isPresented: $isShowingCreateSheet) {
                CreateChatSheet(isPresented: $isShowingCreateSheet)
            }
            .overlay(alignment: .top) {
                if viewModel.isShowingError {
                    BannerView(message: "Не удалось загрузить список чатов")
                }
            }
        }
        .task { viewModel.onAppear() }
    }
}

private struct ChatRowView: View {
    let chat: ChatListItem

    var body: some View {
        HStack(spacing: 16) {
            Circle()
                .fill(Color.blue.opacity(0.2))
                .frame(width: 48, height: 48)
                .overlay(Text(chat.initials).font(.headline))

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(chat.title)
                        .font(.headline)
                    Spacer()
                    Text(chat.relativeDateString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let preview = chat.lastMessagePreview {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if !chat.typingParticipants.isEmpty {
                    Text("Печатает: \(chat.typingParticipants.joined(separator: ", "))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if chat.unreadCount > 0 {
                Text("\(chat.unreadCount)")
                    .font(.footnote.bold())
                    .padding(8)
                    .background(Capsule().fill(Color.blue))
                    .foregroundColor(.white)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct ChatRowSkeleton: View {
    var body: some View {
        HStack(spacing: 16) {
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

private struct CreateChatSheet: View {
    @Binding var isPresented: Bool
    @State private var title: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Название") {
                    TextField("Название чата", text: $title)
                }
            }
            .navigationTitle("Новый чат")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { isPresented = false }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
