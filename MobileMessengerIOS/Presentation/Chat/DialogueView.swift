import PhotosUI
import SwiftUI
import UIKit

@MainActor
struct DialogueView: View {
    let chat: ChatListItem

    @StateObject private var viewModel: ChatViewModel
    @State private var selectedPhotoItem: PhotosPickerItem?

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
                        } else if viewModel.messages.isEmpty {
                            ConversationEmptyState(chat: chat)
                        } else {
                            ForEach(viewModel.messages, id: \._id) { message in
                                MessageBubbleView(message: message, isGroup: chat.isGroup)
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
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.white)

                    Text("Сообщение не отправлено")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)

                    Spacer(minLength: 8)
                }

                Text(message)
                    .font(.footnote)
                    .foregroundColor(.white.opacity(0.96))
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    viewModel.retryFailedMessages()
                    viewModel.banner = nil
                } label: {
                    Label("Повторить", systemImage: "arrow.clockwise")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(Color.red.opacity(0.95))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(Color.white.opacity(0.92))
                        )
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.94))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        case .offline:
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "wifi.slash")
                Text("Нет сети. Сообщения будут отправлены при появлении связи.")
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
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
                        .foregroundStyle(message.isOutgoing ? Color.white.opacity(0.85) : .secondary)
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
                    .stroke(borderColor, lineWidth: 1)
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

private struct ConversationEmptyState: View {
    let chat: ChatListItem

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.12))
                    .frame(width: 76, height: 76)

                Image(systemName: chat.isGroup ? "person.3.fill" : "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(Color.blue.opacity(0.92))
            }

            Text("Начните разговор")
                .font(.title3.weight(.bold))

            Text(chat.isGroup ? "Отправьте первое сообщение в группу и соберите обсуждение здесь." : "Напишите первое сообщение, чтобы диалог ожил.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
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
        .padding(.top, 36)
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
