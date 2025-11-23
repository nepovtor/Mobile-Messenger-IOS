import SwiftUI
import UIKit

struct DialogueView: View {
    @StateObject private var viewModel: ChatViewModel

    init(chatID: UUID, title: String, container: AppContainer = .shared) {
        _viewModel = StateObject(wrappedValue: container.makeChatViewModel(chatID: chatID, title: title))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                List {
                    if viewModel.isLoadingHistory {
                        Section {
                            ForEach(0..<5, id: \.self) { _ in
                                SkeletonView(isActive: true)
                                    .frame(height: 60)
                                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                            }
                        }
                    }

                    Section {
                        ForEach(viewModel.messages, id: \._id) { message in
                            MessageBubbleView(message: message)
                                .id(message.id.messageID)
                                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                                .listRowSeparator(.hidden)
                                .onAppear {
                                    if message == viewModel.messages.last {
                                        viewModel.markAsRead(messageID: message.id.messageID)
                                    }
                                }
                        }
                    }
                }
                .listStyle(.plain)
                .onChange(of: viewModel.messages.count) { _ in
                    if let last = viewModel.messages.last {
                        withAnimation(.easeInOut) {
                            proxy.scrollTo(last.id.messageID, anchor: .bottom)
                        }
                    }
                }
            }

            if let banner = viewModel.banner {
                bannerView(for: banner)
                    .transition(.move(edge: .top))
            }

            messageInput
        }
        .navigationTitle(viewModel.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
    }

    private var messageInput: some View {
        HStack(alignment: .bottom, spacing: 12) {
            TextEditor(text: $viewModel.inputText)
                .frame(minHeight: 36, maxHeight: 120)
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 16).stroke(Color.gray.opacity(0.3)))
                .onTapGesture {
                    if let last = viewModel.messages.last {
                        viewModel.markAsRead(messageID: last.id.messageID)
                    }
                }

            Button(action: viewModel.sendMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
            }
            .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding()
        .background(VisualEffectView(style: .systemMaterial))
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
            .background(Color.red)
        case .offline:
            HStack {
                Image(systemName: "wifi.slash")
                Text("Нет сети. Сообщения будут отправлены при появлении связи.")
                Spacer()
            }
            .padding()
            .background(Color.orange)
            .foregroundColor(.white)
        }
    }
}

private struct MessageBubbleView: View {
    let message: Message

    var body: some View {
        VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 4) {
            if let repliedTo = message.repliedTo {
                Text("Ответ на сообщение \(repliedTo.messageID.uuidString.prefix(4))…")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Text(message.text)
                .padding(12)
                .background(message.isOutgoing ? Color.blue.opacity(0.2) : Color.gray.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 16))

            HStack(spacing: 6) {
                Text(message.createdAt, style: .time)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                if message.isOutgoing {
                    MessageStatusView(status: message.status)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
        .padding(message.isOutgoing ? .leading : .trailing, 48)
        .transition(.asymmetric(insertion: .move(edge: message.isOutgoing ? .trailing : .leading), removal: .opacity))
    }
}

private struct VisualEffectView: UIViewRepresentable {
    let style: UIBlurEffect.Style

    func makeUIView(context: Context) -> UIVisualEffectView {
        UIVisualEffectView(effect: UIBlurEffect(style: style))
    }

    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {}
}

private extension Message {
    var _id: UUID { id.messageID }
}
