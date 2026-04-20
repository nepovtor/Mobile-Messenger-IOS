import PhotosUI
import SwiftUI
import UIKit

@MainActor
struct DialogueView: View {
    let chat: ChatListItem

    @StateObject private var viewModel: ChatViewModel
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var isShowingInfo = false
    @State private var isSearchPresented = false
    @State private var messageSearchQuery = ""
    @State private var selectedSearchResultIndex = 0
    @State private var scrollTargetMessageID: UUID?

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
            ChatWallpaper()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if viewModel.isLoadingHistory {
                            ForEach(0..<5, id: \.self) { index in
                                MessageSkeletonBubble(isOutgoing: index.isMultiple(of: 2))
                            }
                        } else {
                            ForEach(timelineItems) { item in
                                switch item {
                                case .date(let date, let id):
                                    DateDivider(date: date)
                                        .id(id)
                                case .message(let message):
                                    MessageBubbleView(
                                        message: message,
                                        isGroup: chat.isGroup,
                                        showsAuthor: shouldShowAuthor(for: message),
                                        groupsWithPrevious: isGroupedWithPrevious(message),
                                        repliedMessage: message.repliedTo.flatMap(viewModel.message(for:)),
                                        isHighlighted: currentSearchMessageID == message.id.messageID,
                                        onReply: { viewModel.selectReplyTarget(message) },
                                        onCopy: { viewModel.copyText(of: message) }
                                    )
                                    .id(message.id.messageID)
                                    .onAppear {
                                        if message == viewModel.messages.last {
                                            viewModel.markMessageAsReadIfNeeded(message)
                                        }
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
                    if let scrollTargetMessageID {
                        withAnimation(.easeOut(duration: 0.24)) {
                            proxy.scrollTo(scrollTargetMessageID, anchor: .center)
                        }
                    } else {
                        scrollToBottom(using: proxy, animated: true)
                    }
                }
                .onChange(of: scrollTargetMessageID) {
                    guard let scrollTargetMessageID else { return }
                    withAnimation(.easeOut(duration: 0.24)) {
                        proxy.scrollTo(scrollTargetMessageID, anchor: .center)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            messageInput
        }
        .overlay(alignment: .top) {
            if let banner = viewModel.banner {
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
                Menu {
                    Button("Поиск", systemImage: "magnifyingglass") {
                        isSearchPresented = true
                    }

                    if let unreadID = viewModel.firstUnreadIncomingMessageID() {
                        Button("К непрочитанным", systemImage: "arrow.down.circle") {
                            scrollTargetMessageID = unreadID
                        }
                    }

                    Button("Инфо чата", systemImage: "info.circle") {
                        isShowingInfo = true
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $messageSearchQuery,
            isPresented: $isSearchPresented,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Поиск по сообщениям"
        )
        .onChange(of: messageSearchQuery) {
            syncSearchSelection()
        }
        .onChange(of: isSearchPresented) {
            guard !isSearchPresented else { return }
            messageSearchQuery = ""
            selectedSearchResultIndex = 0
            scrollTargetMessageID = nil
        }
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
        .sheet(isPresented: $isShowingInfo) {
            ChatInfoSheet(chat: chat, messages: viewModel.messages)
        }
        .task(id: selectedPhotoItem) {
            guard let selectedPhotoItem,
                  let data = try? await selectedPhotoItem.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else { return }
            viewModel.sendImage(image)
            self.selectedPhotoItem = nil
        }
        .overlay(alignment: .top) {
            if isSearchPresented, !messageSearchQuery.isEmpty, !searchResults.isEmpty {
                SearchResultsPill(
                    currentIndex: selectedSearchResultIndex + 1,
                    totalCount: searchResults.count,
                    onPrevious: selectPreviousSearchResult,
                    onNext: selectNextSearchResult
                )
                .padding(.top, 8)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if let unreadID = viewModel.firstUnreadIncomingMessageID() {
                Button {
                    scrollTargetMessageID = unreadID
                } label: {
                    Label("Непрочитанные", systemImage: "arrow.down.circle.fill")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .padding(.trailing, 16)
                .padding(.bottom, 86)
            }
        }
    }

    @MainActor
    private var messageInput: some View {
        let isSendingMedia = viewModel.isSendingMedia
        let isSendDisabled = viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSendingMedia

        return HStack(alignment: .bottom, spacing: 10) {
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.86))

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
                .shadow(color: Color.black.opacity(0.08), radius: 12, x: 0, y: 8)
            }
            .disabled(isSendingMedia)

            VStack(alignment: .leading, spacing: 8) {
                if let replyTarget = viewModel.replyTarget {
                    HStack(alignment: .top, spacing: 10) {
                        Rectangle()
                            .fill(Color.blue.opacity(0.9))
                            .frame(width: 3)
                            .clipShape(Capsule())

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Ответ")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.blue.opacity(0.95))

                            Text(replyTarget.authorName)
                                .font(.caption2)
                                .foregroundStyle(.secondary)

                            Text(replyPreviewText(for: replyTarget))
                                .font(.caption)
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                        }

                        Spacer(minLength: 0)

                        Button {
                            viewModel.clearReplyTarget()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.secondary)
                                .frame(width: 24, height: 24)
                                .background(Color.white.opacity(0.5), in: Circle())
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 10)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    ZStack(alignment: .topLeading) {
                        if viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(viewModel.replyTarget == nil ? "Сообщение" : "Ответ")
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
                                    viewModel.markMessageAsReadIfNeeded(last)
                                }
                            }
                    }

                    Button(action: viewModel.sendMessage) {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [Color.blue, Color.cyan],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                            )
                    }
                    .disabled(isSendDisabled)
                    .opacity(isSendDisabled ? 0.55 : 1)
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.white.opacity(0.5), lineWidth: 1)
            }
            .shadow(color: Color.black.opacity(0.08), radius: 16, x: 0, y: 10)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(
            Rectangle()
                .fill(.thinMaterial)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color.white.opacity(0.45))
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
            .background(Color.red.opacity(0.94))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        case .offline:
            HStack {
                Image(systemName: "wifi.slash")
                Text("Нет сети. Сообщения будут отправлены при появлении связи.")
                Spacer()
            }
            .padding()
            .background(Color.orange.opacity(0.94))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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

    private var timelineItems: [TimelineItem] {
        var items: [TimelineItem] = []
        var lastDay: Date?

        for message in viewModel.messages {
            let day = Calendar.current.startOfDay(for: message.createdAt)
            if lastDay != day {
                items.append(.date(day, id: "day_\(day.timeIntervalSince1970)"))
                lastDay = day
            }
            items.append(.message(message))
        }

        return items
    }

    private func shouldShowAuthor(for message: Message) -> Bool {
        guard chat.isGroup, !message.isOutgoing else { return false }
        guard let previous = previousMessage(for: message) else { return true }
        return !belongsToSameVisualGroup(previous, message)
    }

    private func isGroupedWithPrevious(_ message: Message) -> Bool {
        guard let previous = previousMessage(for: message) else { return false }
        return belongsToSameVisualGroup(previous, message)
    }

    private func previousMessage(for message: Message) -> Message? {
        guard let index = viewModel.messages.firstIndex(of: message), index > 0 else { return nil }
        return viewModel.messages[index - 1]
    }

    private func belongsToSameVisualGroup(_ lhs: Message, _ rhs: Message) -> Bool {
        guard lhs.authorID == rhs.authorID, lhs.isOutgoing == rhs.isOutgoing else { return false }
        return abs(lhs.createdAt.timeIntervalSince(rhs.createdAt)) < 5 * 60
    }

    private func replyPreviewText(for message: Message) -> String {
        if message.attachments.contains(where: { $0.kind == .image }) {
            return message.text.isEmpty ? "Фотография" : "Фотография: \(message.text)"
        }
        return message.text.isEmpty ? "Сообщение" : message.text
    }

    private var searchResults: [Message] {
        let query = messageSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return [] }
        return viewModel.messages.filter { message in
            message.text.lowercased().contains(query) || message.authorName.lowercased().contains(query)
        }
    }

    private var currentSearchMessageID: UUID? {
        guard searchResults.indices.contains(selectedSearchResultIndex) else { return nil }
        return searchResults[selectedSearchResultIndex].id.messageID
    }

    private func syncSearchSelection() {
        if searchResults.isEmpty {
            selectedSearchResultIndex = 0
            scrollTargetMessageID = nil
            return
        }
        selectedSearchResultIndex = min(selectedSearchResultIndex, searchResults.count - 1)
        scrollTargetMessageID = searchResults[selectedSearchResultIndex].id.messageID
    }

    private func selectPreviousSearchResult() {
        guard !searchResults.isEmpty else { return }
        selectedSearchResultIndex = (selectedSearchResultIndex - 1 + searchResults.count) % searchResults.count
        scrollTargetMessageID = searchResults[selectedSearchResultIndex].id.messageID
    }

    private func selectNextSearchResult() {
        guard !searchResults.isEmpty else { return }
        selectedSearchResultIndex = (selectedSearchResultIndex + 1) % searchResults.count
        scrollTargetMessageID = searchResults[selectedSearchResultIndex].id.messageID
    }
}

private enum TimelineItem: Identifiable {
    case date(Date, id: String)
    case message(Message)

    var id: String {
        switch self {
        case .date(_, let id):
            return id
        case .message(let message):
            return message.id.messageID.uuidString
        }
    }
}

private struct ChatHeaderView: View {
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
                        .fill(Color.blue.opacity(0.14))

                    Text(chat.initials)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.blue.opacity(0.9))
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
}

private struct MessageBubbleView: View {
    let message: Message
    let isGroup: Bool
    let showsAuthor: Bool
    let groupsWithPrevious: Bool
    let repliedMessage: Message?
    let isHighlighted: Bool
    let onReply: () -> Void
    let onCopy: () -> Void

    var body: some View {
        VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 6) {
            if showsAuthor {
                Text(message.authorName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.blue.opacity(0.9))
                    .padding(.horizontal, 6)
            }

            VStack(alignment: .leading, spacing: 8) {
                if let repliedMessage {
                    ReplySnippetView(
                        message: repliedMessage,
                        tint: message.isOutgoing ? Color.white.opacity(0.9) : Color.blue.opacity(0.9),
                        secondaryTint: message.isOutgoing ? Color.white.opacity(0.72) : .secondary
                    )
                }

                if let imageAttachment = message.attachments.first(where: { $0.kind == .image }) {
                    MessageAttachmentImageView(attachment: imageAttachment)
                }

                if !message.text.isEmpty || message.kind == .text {
                    Text(message.text)
                        .foregroundStyle(message.isOutgoing ? .white : .primary)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(bubbleBackground)
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(isHighlighted ? Color.blue.opacity(0.9) : borderColor, lineWidth: isHighlighted ? 2 : 1)
            }
            .contextMenu {
                Button("Ответить", systemImage: "arrowshape.turn.up.left") {
                    onReply()
                }

                if !message.text.isEmpty {
                    Button("Скопировать", systemImage: "doc.on.doc") {
                        onCopy()
                    }
                }
            }

            HStack(spacing: 6) {
                Text(message.createdAt, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if message.isOutgoing {
                    MessageStatusView(status: message.status)
                }
            }
            .padding(.horizontal, 6)
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
        .padding(message.isOutgoing ? .leading : .trailing, 54)
        .padding(.top, groupsWithPrevious ? 2 : 8)
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
                : AnyShapeStyle(Color.white.opacity(0.74))
            )
    }

    private var borderColor: Color {
        message.isOutgoing ? Color.white.opacity(0.16) : Color.white.opacity(0.55)
    }
}

private struct DateDivider: View {
    let date: Date

    var body: some View {
        Text(dateLabel)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .stroke(Color.white.opacity(0.5), lineWidth: 1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
    }

    private var dateLabel: String {
        if Calendar.current.isDateInToday(date) {
            return "Сегодня"
        }
        if Calendar.current.isDateInYesterday(date) {
            return "Вчера"
        }

        return date.formatted(.dateTime.day().month(.wide))
    }
}

private struct ReplySnippetView: View {
    let message: Message
    let tint: Color
    let secondaryTint: Color

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Rectangle()
                .fill(tint)
                .frame(width: 3)
                .clipShape(Capsule())

            VStack(alignment: .leading, spacing: 2) {
                Text(message.authorName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tint)

                Text(snippet)
                    .font(.caption)
                    .foregroundStyle(secondaryTint)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.black.opacity(message.isOutgoing ? 0.12 : 0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var snippet: String {
        if message.attachments.contains(where: { $0.kind == .image }) {
            return message.text.isEmpty ? "Фотография" : "Фотография: \(message.text)"
        }
        return message.text.isEmpty ? "Сообщение" : message.text
    }
}

private struct SearchResultsPill: View {
    let currentIndex: Int
    let totalCount: Int
    let onPrevious: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text("\(currentIndex) из \(totalCount)")
                .font(.caption.weight(.semibold))

            Button(action: onPrevious) {
                Image(systemName: "chevron.up")
                    .font(.caption.weight(.bold))
            }

            Button(action: onNext) {
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay {
            Capsule()
                .stroke(Color.white.opacity(0.5), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.08), radius: 12, x: 0, y: 6)
    }
}

private struct ChatInfoSheet: View {
    let chat: ChatListItem
    let messages: [Message]

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    private var sharedMedia: [MessageAttachment] {
        messages
            .flatMap(\.attachments)
            .filter { $0.kind == .image }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(chat.title)
                            .font(.title2.weight(.bold))
                        Text(chat.isGroup ? "Участников: \(chat.participantCount)" : "Личный чат")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    if !chat.participantNames.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Участники")
                                .font(.headline)

                            ForEach(chat.participantNames, id: \.self) { name in
                                Text(name)
                                    .font(.body)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .background(Color.white.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Общие медиа")
                            .font(.headline)

                        if sharedMedia.isEmpty {
                            Text("Медиа пока нет")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        } else {
                            LazyVGrid(columns: columns, spacing: 10) {
                                ForEach(Array(sharedMedia.enumerated()), id: \.offset) { _, attachment in
                                    MessageAttachmentImageView(attachment: attachment)
                                        .frame(height: 110)
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(ChatWallpaper())
            .navigationTitle("Информация")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct MessageAttachmentImageView: View {
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
                .fill(Color.white.opacity(0.28))
            ProgressView()
        }
    }
}

private struct MessageSkeletonBubble: View {
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
                    .fill(Color.white.opacity(0.55))
            )

            if !isOutgoing { Spacer(minLength: 54) }
        }
    }
}

private struct ChatWallpaper: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.89, green: 0.95, blue: 1.00),
                    Color(red: 0.94, green: 0.98, blue: 0.98),
                    Color(red: 0.92, green: 0.96, blue: 1.00)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            ForEach(0..<14, id: \.self) { index in
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(index.isMultiple(of: 2) ? Color.white.opacity(0.15) : Color.cyan.opacity(0.08))
                    .frame(width: CGFloat(60 + (index % 4) * 18), height: CGFloat(60 + (index % 4) * 18))
                    .rotationEffect(.degrees(Double(index * 17)))
                    .offset(
                        x: CGFloat((index % 4) * 96) - 140,
                        y: CGFloat(index * 72) - 420
                    )
            }

            Circle()
                .fill(Color.white.opacity(0.32))
                .frame(width: 260, height: 260)
                .blur(radius: 16)
                .offset(x: 150, y: -320)

            Circle()
                .fill(Color.blue.opacity(0.08))
                .frame(width: 280, height: 280)
                .offset(x: -160, y: 280)
        }
        .ignoresSafeArea()
    }
}

private extension Message {
    var _id: UUID { id.messageID }
}
