import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

@MainActor
struct DialogueView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var container: AppContainer
    let chat: ChatListItem

    @StateObject private var viewModel: ChatViewModel
    @StateObject private var voiceRecorder = VoiceMessageRecorder()
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var preparedImage: UIImage?
    @State private var editDraft = ""
    @State private var pendingDeleteMessage: Message?
    @State private var isNearBottom = true
    @State private var hasNewMessagesBelow = false
    @State private var olderHistoryAnchorID: UUID?
    @State private var hasPerformedInitialScroll = false
    @State private var composerTextHeight: CGFloat = 36

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

            GeometryReader { viewport in
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            if viewModel.isLoadingHistory {
                                ForEach(0..<5, id: \.self) { index in
                                    MessageSkeletonBubble(isOutgoing: index.isMultiple(of: 2))
                                }
                            } else {
                                if viewModel.hasMoreHistory, let firstMessage = viewModel.messages.first {
                                    Group {
                                        if viewModel.isLoadingOlderHistory {
                                            ProgressView()
                                                .controlSize(.small)
                                        } else {
                                            Color.clear
                                        }
                                    }
                                        .frame(height: 28)
                                        .frame(maxWidth: .infinity)
                                        .onAppear {
                                            loadOlderMessages(preserving: firstMessage.localID)
                                        }
                                        .accessibilityLabel("Загрузка предыдущих сообщений")
                                }

                                ForEach(viewModel.messages, id: \.localID) { message in
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
                                        .id(message.localID)
                                        .onAppear {
                                            if message == viewModel.messages.last {
                                                viewModel.markAsRead(messageID: message.id.messageID)
                                            }
                                        }
                                }
                            }

                            Color.clear
                                .frame(height: 1)
                                .id(ChatScrollTarget.bottom)
                                .background {
                                    GeometryReader { bottomMarker in
                                        Color.clear.preference(
                                            key: ChatBottomOffsetPreferenceKey.self,
                                            value: bottomMarker.frame(in: .named(ChatScrollSpace.name)).maxY
                                        )
                                    }
                                }
                        }
                        .padding(.horizontal, 12)
                        .padding(.top, 14)
                        .padding(.bottom, 12)
                    }
                    .coordinateSpace(name: ChatScrollSpace.name)
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .onPreferenceChange(ChatBottomOffsetPreferenceKey.self) { bottomOffset in
                        updateBottomProximity(
                            bottomOffset: bottomOffset,
                            viewportHeight: viewport.size.height
                        )
                    }
                    .onAppear {
                        scrollToBottom(using: proxy, animated: false)
                    }
                    .onChange(of: viewModel.messages.last?.localID) { previousID, newID in
                        handleLastMessageChange(
                            previousID: previousID,
                            newID: newID,
                            using: proxy
                        )
                    }
                    .onChange(of: viewModel.isLoadingOlderHistory) { wasLoading, isLoading in
                        guard wasLoading, !isLoading, let anchorID = olderHistoryAnchorID else { return }
                        olderHistoryAnchorID = nil
                        restoreScrollPosition(to: anchorID, using: proxy)
                    }
                    .overlay(alignment: .bottomTrailing) {
                        if hasNewMessagesBelow {
                            Button {
                                hasNewMessagesBelow = false
                                scrollToBottom(using: proxy, animated: true)
                            } label: {
                                Label("Новые сообщения", systemImage: "arrow.down")
                                    .font(.footnote.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .frame(height: 36)
                                    .foregroundStyle(.white)
                                    .background(
                                        Capsule(style: .continuous)
                                            .fill(AppTheme.primary)
                                    )
                                    .shadow(color: Color.black.opacity(0.16), radius: 8, y: 3)
                            }
                            .buttonStyle(.plain)
                            .padding(12)
                            .accessibilityIdentifier("newMessagesButton")
                        }
                    }
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
        .toolbar(.hidden, for: .tabBar)
        .onAppear { viewModel.onAppear() }
        .onDisappear {
            voiceRecorder.cancel()
            viewModel.onDisappear()
        }
        .task(id: selectedPhotoItem) {
            guard let selectedPhotoItem else { return }

            do {
                let data = try await selectedPhotoItem.loadTransferable(type: Data.self)
                guard !Task.isCancelled else { return }
                guard let data, let image = UIImage(data: data) else {
                    viewModel.banner = .error("Не удалось подготовить фотографию")
                    self.selectedPhotoItem = nil
                    return
                }

                preparedImage = image
                self.selectedPhotoItem = nil
            } catch {
                guard !Task.isCancelled else { return }
                viewModel.banner = .error("Не удалось подготовить фотографию")
                self.selectedPhotoItem = nil
            }
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
        let isPreparingMedia = selectedPhotoItem != nil
        let hasText = !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasPreparedAttachment = preparedImage != nil
        let isSendDisabled = (!hasText && !hasPreparedAttachment) || isSendingMedia || isPreparingMedia
        let inputInnerDarkness = isHighContrastDarkActive ? 0.10 : 0.06
        let toolbarBackground = toolbarBackgroundColor

        return VStack(spacing: 0) {
            if let preparedImage {
                HStack(spacing: 10) {
                    Image(uiImage: preparedImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 38, height: 38)
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                    Text("Фото готово к отправке")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer(minLength: 8)

                    Button {
                        self.preparedImage = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Удалить вложение")
                }
                .padding(.horizontal, 10)
                .padding(.top, 8)
            }

            HStack(alignment: .bottom, spacing: 4) {
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    ZStack {
                        if isSendingMedia || isPreparingMedia {
                            ProgressView()
                                .progressViewStyle(.circular)
                        } else {
                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(AppTheme.primary.opacity(0.9))
                        }
                    }
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
                }
                .disabled(isSendingMedia || isPreparingMedia)
                .accessibilityLabel("Прикрепить фотографию")
                .accessibilityIdentifier("messageAttachmentButton")

                ZStack(alignment: .leading) {
                    GrowingMessageTextView(
                        text: $viewModel.inputText,
                        measuredHeight: $composerTextHeight,
                        minimumHeight: 36,
                        maximumLines: 5
                    )
                    .frame(height: composerTextHeight)

                    if viewModel.inputText.isEmpty {
                        Text("Сообщение")
                            .font(.body)
                            .foregroundStyle(.tertiary)
                            .padding(.leading, 9)
                            .allowsHitTesting(false)
                    }
                }
                    .padding(.horizontal, 6)
                    .onChange(of: viewModel.inputText) {
                        viewModel.handleInputChanged(viewModel.inputText)
                    }
                    .onTapGesture {
                        if let last = viewModel.messages.last {
                            viewModel.markAsRead(messageID: last.id.messageID)
                        }
                    }
                    .accessibilityIdentifier("messageComposerTextField")

                Button(action: sendDraft) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .liquidGlassCircle(
                            tint: AppTheme.primary,
                            secondaryTint: AppTheme.aqua,
                            innerDarkness: 0.54
                        )
                }
                .disabled(isSendDisabled)
                .opacity(isSendDisabled ? 0.45 : 1)
                .accessibilityLabel("Отправить сообщение")
                .accessibilityIdentifier("messageSendButton")
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .liquidGlassCard(
            cornerRadius: 24,
            tint: .white,
            secondaryTint: AppTheme.aqua,
            innerDarkness: inputInnerDarkness
        )
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Rectangle()
                .fill(toolbarBackground)
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(toolbarDividerColor)
                        .frame(height: 1)
                }
        )
    }

    private func sendDraft() {
        if let preparedImage {
            self.preparedImage = nil
            viewModel.sendImage(preparedImage)
        } else {
            viewModel.sendMessage()
        }
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
                tint: AppTheme.coral,
                secondaryTint: .white,
                innerDarkness: 0.42
            )
        case .offline:
            EmptyView()
        }
    }

    private func scrollToBottom(using proxy: ScrollViewProxy, animated: Bool) {
        guard !viewModel.messages.isEmpty else { return }

        Task { @MainActor in
            await Task.yield()

            if animated {
                withAnimation(.easeOut(duration: 0.24)) {
                    proxy.scrollTo(ChatScrollTarget.bottom, anchor: .bottom)
                }
            } else {
                proxy.scrollTo(ChatScrollTarget.bottom, anchor: .bottom)
            }

            hasPerformedInitialScroll = true
        }
    }

    private func handleLastMessageChange(
        previousID: UUID?,
        newID: UUID?,
        using proxy: ScrollViewProxy
    ) {
        guard let newID, previousID != newID else { return }

        let shouldFollowMessage = previousID == nil || isNearBottom || viewModel.messages.last?.isOutgoing == true
        if shouldFollowMessage {
            hasNewMessagesBelow = false
            scrollToBottom(using: proxy, animated: previousID != nil)
        } else {
            hasNewMessagesBelow = true
        }
    }

    private func updateBottomProximity(bottomOffset: CGFloat, viewportHeight: CGFloat) {
        guard bottomOffset.isFinite, viewportHeight > 0 else { return }

        let nearBottomThreshold: CGFloat = 120
        let isNowNearBottom = bottomOffset <= viewportHeight + nearBottomThreshold
        isNearBottom = isNowNearBottom
        if isNowNearBottom {
            hasNewMessagesBelow = false
        }
    }

    private func loadOlderMessages(preserving anchorID: UUID) {
        guard hasPerformedInitialScroll, !viewModel.isLoadingOlderHistory else { return }
        olderHistoryAnchorID = anchorID
        viewModel.loadOlderMessages()
    }

    private func restoreScrollPosition(to anchorID: UUID, using proxy: ScrollViewProxy) {
        Task { @MainActor in
            await Task.yield()
            proxy.scrollTo(anchorID, anchor: .top)
        }
    }

    private var toolbarBackgroundColor: Color {
        Color(uiColor: .systemBackground)
    }

    private var toolbarDividerColor: Color {
        Color(uiColor: .separator).opacity(0.45)
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
            .fill(isOnline ? AppTheme.mint : AppTheme.amber)
            .frame(width: 10, height: 10)
            .overlay {
                Circle()
                    .stroke(borderColor, lineWidth: 1)
            }
            .shadow(color: (isOnline ? AppTheme.mint : AppTheme.amber).opacity(0.35), radius: 4, x: 0, y: 0)
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
                                colors: [AppTheme.primary.opacity(0.9), AppTheme.aqua.opacity(0.75)],
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
        return AppTheme.primary.opacity(0.14)
    }

    private var avatarTextColor: Color {
        isHighContrastDarkActive ? .white : AppTheme.primary.opacity(0.9)
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
                    .foregroundStyle(AppTheme.primary.opacity(0.9))
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
                        colors: [AppTheme.primary.opacity(0.95), AppTheme.aqua.opacity(0.82)],
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
            accent: AppTheme.primary,
            secondaryAccent: AppTheme.aqua,
            tertiaryAccent: AppTheme.coral
        )
    }
}

private enum ChatScrollTarget: Hashable {
    case bottom
}

private struct GrowingMessageTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var measuredHeight: CGFloat
    let minimumHeight: CGFloat
    let maximumLines: Int

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.backgroundColor = .clear
        textView.font = .preferredFont(forTextStyle: .body)
        textView.adjustsFontForContentSizeCategory = true
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 4, bottom: 8, right: 4)
        textView.textContainer.lineFragmentPadding = 5
        textView.isScrollEnabled = false
        textView.showsVerticalScrollIndicator = true
        textView.keyboardDismissMode = .interactive
        textView.textContainer.lineBreakMode = .byWordWrapping
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textView.accessibilityIdentifier = "messageComposerTextField"
        context.coordinator.textView = textView
        return textView
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        context.coordinator.parent = self
        if textView.text != text {
            textView.text = text
        }

        DispatchQueue.main.async { [weak coordinator = context.coordinator] in
            coordinator?.recalculateHeight()
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: GrowingMessageTextView
        weak var textView: UITextView?

        init(parent: GrowingMessageTextView) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            recalculateHeight()
        }

        func recalculateHeight() {
            guard let textView, textView.bounds.width > 0 else { return }

            let font = textView.font ?? .preferredFont(forTextStyle: .body)
            let insets = textView.textContainerInset.top + textView.textContainerInset.bottom
            let maximumHeight = ceil(font.lineHeight * CGFloat(parent.maximumLines) + insets)
            let fittingHeight = ceil(
                textView.sizeThatFits(
                    CGSize(width: textView.bounds.width, height: .greatestFiniteMagnitude)
                ).height
            )
            let targetHeight = min(max(parent.minimumHeight, fittingHeight), maximumHeight)
            let shouldScroll = fittingHeight > maximumHeight

            if textView.isScrollEnabled != shouldScroll {
                textView.isScrollEnabled = shouldScroll
            }
            if abs(parent.measuredHeight - targetHeight) > 0.5 {
                parent.measuredHeight = targetHeight
            }
        }
    }
}

private enum ChatScrollSpace {
    static let name = "dialogueMessagesScroll"
}

private struct ChatBottomOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = .infinity

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
