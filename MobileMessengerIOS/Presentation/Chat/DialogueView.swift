import PhotosUI
import SwiftUI
import UIKit

@MainActor
struct DialogueView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    let chat: ChatListItem

    @StateObject private var viewModel: ChatViewModel
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var editDraft = ""
    @State private var pendingDeleteMessage: Message?

    @MainActor
    init(chat: ChatListItem) {
        self.init(chat: chat, container: .shared)
    }

    @MainActor
    init(chat: ChatListItem, container: AppContainer) {
        self.chat = chat
        _viewModel = StateObject(wrappedValue: container.makeChatViewModel(chatID: chat.id, title: chat.title))
    }

    var body: some View {
        ZStack {
            ChatWallpaper(isHighContrastDarkActive: isHighContrastDarkActive)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if viewModel.isLoadingHistory {
                            ForEach(0..<5, id: \.self) { index in
                                MessageSkeletonBubble(isOutgoing: index.isMultiple(of: 2))
                            }
                        } else {
                            ForEach(viewModel.messages, id: \._id) { message in
                                MessageBubbleView(message: message, isGroup: chat.isGroup)
                                    .contextMenu {
                                        if message.isOutgoing && message.deletedAt == nil {
                                            if message.kind == .text {
                                                Button("Изменить") {
                                                    editDraft = message.text
                                                    viewModel.beginEditing(message)
                                                }
                                            }

                                            Button("Удалить", role: .destructive) {
                                                pendingDeleteMessage = message
                                            }
                                        }
                                    }
                                    .id(message.id.messageID)
                                    .onAppear {
                                        if message == viewModel.messages.last {
                                            viewModel.markAsRead(messageID: message.id.messageID)
                                        }
                                    }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 14)
                    .padding(.bottom, 12)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .onAppear {
                    scrollToBottom(using: proxy, animated: false)
                }
                .onChange(of: viewModel.messages.count) {
                    scrollToBottom(using: proxy, animated: true)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            messageInput
        }
        .overlay(alignment: .top) {
            if case .error = viewModel.banner, let banner = viewModel.banner {
                bannerView(for: banner)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                ChatHeaderView(chat: chat)
            }

            ToolbarItem(placement: .navigationBarTrailing) {
                NetworkStatusIndicator(isOnline: viewModel.isNetworkReachable)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
        .task(id: selectedPhotoItem) {
            guard let selectedPhotoItem,
                  let data = try? await selectedPhotoItem.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else { return }
            viewModel.sendImage(image)
            self.selectedPhotoItem = nil
        }
        .sheet(item: $viewModel.activeEditMessage) { message in
            NavigationStack {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Изменить сообщение")
                        .font(.headline)

                    TextEditor(text: $editDraft)
                        .frame(minHeight: 140)
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(Color(uiColor: .secondarySystemBackground))
                        )

                    Text("Можно изменить только своё текстовое сообщение.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Spacer()
                }
                .padding(20)
                .navigationTitle("Редактирование")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Отмена") {
                            viewModel.cancelEditing()
                        }
                    }

                    ToolbarItem(placement: .confirmationAction) {
                        Button("Сохранить") {
                            viewModel.saveEdit(text: editDraft)
                        }
                        .disabled(editDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                .onAppear {
                    editDraft = message.text
                }
            }
        }
        .alert("Удалить сообщение?", isPresented: Binding(
            get: { pendingDeleteMessage != nil },
            set: { isPresented in
                if !isPresented {
                    pendingDeleteMessage = nil
                }
            }
        )) {
            Button("Отмена", role: .cancel) {
                pendingDeleteMessage = nil
            }
            Button("Удалить", role: .destructive) {
                if let pendingDeleteMessage {
                    viewModel.deleteMessage(pendingDeleteMessage)
                }
                pendingDeleteMessage = nil
            }
        } message: {
            Text("Сообщение будет заменено на пометку об удалении.")
        }
    }

    @MainActor
    private var messageInput: some View {
        let isSendingMedia = viewModel.isSendingMedia
        let isSendDisabled = viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSendingMedia
        let mediaBackgroundColor = mediaButtonBackgroundColor

        return HStack(alignment: .bottom, spacing: 10) {
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                ZStack {
                    if isSendingMedia {
                        ProgressView()
                            .progressViewStyle(.circular)
                    } else {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color.blue.opacity(0.9))
                    }
                }
                .frame(width: 42, height: 42)
                .liquidGlassCircle(
                    tint: Color.white,
                    secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
                    innerDarkness: isHighContrastDarkActive ? 0.12 : 0.04
                )
            }
            .disabled(isSendingMedia)

            HStack(alignment: .bottom, spacing: 10) {
                ZStack(alignment: .topLeading) {
                    if viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Сообщение")
                            .foregroundStyle(.secondary)
                            .padding(.top, 10)
                            .padding(.leading, 6)
                    }

                    TextEditor(text: $viewModel.inputText)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 24, maxHeight: 108)
                        .padding(.horizontal, 2)
                        .onChange(of: viewModel.inputText) {
                            viewModel.handleInputChanged(viewModel.inputText)
                        }
                        .onTapGesture {
                            if let last = viewModel.messages.last {
                                viewModel.markAsRead(messageID: last.id.messageID)
                            }
                        }
                }

                Button(action: viewModel.sendMessage) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .liquidGlassCircle(
                            tint: Color(red: 0.30, green: 0.47, blue: 1.00),
                            secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
                            innerDarkness: 0.54
                        )
                }
                .disabled(isSendDisabled)
                .opacity(isSendDisabled ? 0.55 : 1)
            }
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .padding(.vertical, 8)
            .liquidGlassCard(
                cornerRadius: 26,
                tint: .white,
                secondaryTint: Color(red: 0.07, green: 0.82, blue: 0.97),
                innerDarkness: isHighContrastDarkActive ? 0.12 : 0.08
            )
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(
            Rectangle()
                .fill(.thinMaterial)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(toolbarDividerColor)
                        .frame(height: 1)
                }
        )
    }

    @ViewBuilder
    private func bannerView(for banner: ChatViewModel.Banner) -> some View {
        switch banner {
        case .error(let message):
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.white)
                Text(message)
                    .font(.footnote)
                    .foregroundColor(.white)
                Spacer()
                Button("Повторить") {
                    viewModel.retryFailedMessages()
                    self.viewModel.banner = nil
                }
                .foregroundColor(.white)
            }
            .padding()
            .liquidGlassCard(
                cornerRadius: 18,
                tint: .red,
                secondaryTint: .white,
                innerDarkness: 0.42
            )
        case .offline:
            EmptyView()
        }
    }

    private func scrollToBottom(using proxy: ScrollViewProxy, animated: Bool) {
        guard let last = viewModel.messages.last else { return }

        if animated {
            withAnimation(.easeOut(duration: 0.24)) {
                proxy.scrollTo(last.id.messageID, anchor: .bottom)
            }
        } else {
            proxy.scrollTo(last.id.messageID, anchor: .bottom)
        }
    }

    private var mediaButtonBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color(uiColor: .secondarySystemBackground)
        }
        return Color.white.opacity(0.86)
    }

    private var inputBackgroundStyle: AnyShapeStyle {
        if isHighContrastDarkActive {
            return AnyShapeStyle(Color(uiColor: .secondarySystemBackground))
        }
        return AnyShapeStyle(.ultraThinMaterial)
    }

    private var inputBorderColor: Color {
        if isHighContrastDarkActive {
            return Color.white.opacity(0.14)
        }
        return Color.white.opacity(0.5)
    }

    private var toolbarDividerColor: Color {
        if isHighContrastDarkActive {
            return Color.white.opacity(0.10)
        }
        return Color.white.opacity(0.45)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct NetworkStatusIndicator: View {
    @Environment(\.colorScheme) private var colorScheme
    let isOnline: Bool

    var body: some View {
        Circle()
            .fill(isOnline ? Color.green : Color.orange)
            .frame(width: 10, height: 10)
            .overlay {
                Circle()
                    .stroke(borderColor, lineWidth: 1)
            }
            .shadow(color: (isOnline ? Color.green : Color.orange).opacity(0.35), radius: 4, x: 0, y: 0)
            .accessibilityLabel(isOnline ? "Сеть доступна" : "Нет сети")
            .accessibilityHint("Индикатор состояния сети")
    }

    private var borderColor: Color {
        colorScheme == .dark ? Color.black.opacity(0.35) : Color.white.opacity(0.9)
    }
}

private struct ChatHeaderView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    let chat: ChatListItem

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                if chat.isGroup {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color.blue.opacity(0.9), Color.cyan.opacity(0.75)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    Image(systemName: "person.3.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                } else {
                    Circle()
                        .fill(avatarBackgroundColor)

                    Text(chat.initials)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(avatarTextColor)
                }
            }
            .frame(width: 32, height: 32)

            VStack(spacing: 2) {
                Text(chat.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private var subtitle: String {
        if chat.isGroup {
            return chat.participantsSummary ?? "\(chat.participantCount) участников"
        }
        return "Личный чат"
    }

    private var avatarBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color.blue.opacity(0.24)
        }
        return Color.blue.opacity(0.14)
    }

    private var avatarTextColor: Color {
        isHighContrastDarkActive ? .white : Color.blue.opacity(0.9)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct MessageBubbleView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    let message: Message
    let isGroup: Bool

    var body: some View {
        VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 6) {
            if isGroup && !message.isOutgoing {
                Text(message.authorName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.blue.opacity(0.9))
                    .padding(.horizontal, 6)
            }

            VStack(alignment: .leading, spacing: 8) {
                if let repliedTo = message.repliedTo {
                    Text("Ответ на сообщение \(repliedTo.messageID.uuidString.prefix(4))…")
                        .font(.caption)
                        .foregroundStyle(replyTextColor)
                }

                if let imageAttachment = message.attachments.first(where: { $0.kind == .image }) {
                    MessageAttachmentImageView(attachment: imageAttachment)
                }

                if !message.text.isEmpty || message.kind == .text {
                    Text(message.text)
                        .foregroundStyle(message.isOutgoing ? .white : .primary)
                        .multilineTextAlignment(.leading)
                        .italic(message.deletedAt != nil)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(bubbleBackground)
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            }

            HStack(spacing: 6) {
                Text(message.createdAt, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if message.editedAt != nil {
                    Text("изменено")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if message.isOutgoing {
                    MessageStatusView(status: message.status)
                }
            }
            .padding(.horizontal, 6)
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
        .padding(message.isOutgoing ? .leading : .trailing, 54)
        .transition(
            .asymmetric(
                insertion: .move(edge: message.isOutgoing ? .trailing : .leading).combined(with: .opacity),
                removal: .opacity
            )
        )
    }

    private var bubbleBackground: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(
                message.isOutgoing
                ? AnyShapeStyle(
                    LinearGradient(
                        colors: [Color.blue.opacity(0.95), Color.cyan.opacity(0.82)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                : AnyShapeStyle(incomingBubbleBackgroundColor)
            )
    }

    private var borderColor: Color {
        if message.isOutgoing {
            return Color.white.opacity(0.16)
        }
        if isHighContrastDarkActive {
            return Color.white.opacity(0.12)
        }
        return Color.white.opacity(0.55)
    }

    private var replyTextColor: AnyShapeStyle {
        if message.isOutgoing {
            return AnyShapeStyle(Color.white.opacity(0.85))
        }
        return AnyShapeStyle(.secondary)
    }

    private var incomingBubbleBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color(uiColor: .secondarySystemBackground)
        }
        return Color.white.opacity(0.74)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct MessageAttachmentImageView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    let attachment: MessageAttachment

    var body: some View {
        Group {
            if let localPath = attachment.localPath,
               let localImage = UIImage(contentsOfFile: localPath.path) {
                Image(uiImage: localImage)
                    .resizable()
                    .scaledToFill()
            } else if let imageURL = attachment.url {
                AsyncImage(url: imageURL) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(maxWidth: 240, maxHeight: 240)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(placeholderBackgroundColor)
            ProgressView()
        }
    }

    private var placeholderBackgroundColor: Color {
        if isHighContrastDarkActive {
            return Color(uiColor: .secondarySystemBackground)
        }
        return Color.white.opacity(0.28)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct MessageSkeletonBubble: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    let isOutgoing: Bool

    var body: some View {
        HStack {
            if isOutgoing { Spacer(minLength: 54) }

            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(isActive: true)
                    .frame(width: 140, height: 16)
                    .clipShape(Capsule())
                SkeletonView(isActive: true)
                    .frame(width: 190, height: 14)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(backgroundColor)
            )

            if !isOutgoing { Spacer(minLength: 54) }
        }
    }

    private var backgroundColor: Color {
        if isHighContrastDarkActive {
            return Color(uiColor: .secondarySystemBackground)
        }
        return Color.white.opacity(0.55)
    }

    private var isHighContrastDarkActive: Bool {
        colorScheme == .dark && container.highContrastDarkMode
    }
}

private struct ChatWallpaper: View {
    let isHighContrastDarkActive: Bool

    var body: some View {
        LiquidGlassBackground(
            accent: Color(red: 0.30, green: 0.47, blue: 1.00),
            secondaryAccent: Color(red: 0.07, green: 0.82, blue: 0.97),
            tertiaryAccent: Color(red: 0.93, green: 0.35, blue: 0.76)
        )
    }
}

private extension Message {
    var _id: UUID { id.messageID }
}
