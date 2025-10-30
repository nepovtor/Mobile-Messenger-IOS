import SwiftUI

struct ChatMessage: Identifiable, Equatable {
    enum DeliveryStatus: String {
        case sending = "Sending"
        case sent = "Sent"
        case delivered = "Delivered"
        case read = "Read"
    }

    let id = UUID()
    let text: String
    let isOutgoing: Bool
    var status: DeliveryStatus
}

struct DialogueView: View {
    @StateObject private var viewModel: ChatViewModel
    @State private var inputText: String = ""
    @FocusState private var isInputFocused: Bool

    init(viewModel: ChatViewModel = ChatViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        VStack(spacing: 0) {
            conversationHeader

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if viewModel.isTyping {
                            typingIndicator
                                .transition(.opacity)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(Color(.systemGroupedBackground))
                .onChange(of: viewModel.messages.count) { _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: viewModel.isTyping) { _ in
                    scrollToBottom(proxy: proxy)
                }
            }

            messageComposer
        }
        .animation(.easeInOut, value: viewModel.messages)
        .animation(.easeInOut, value: viewModel.isTyping)
        .onAppear {
            viewModel.start()
        }
        .onDisappear {
            viewModel.stop()
        }
    }

    private var conversationHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Диалог")
                    .font(.title2)
                    .bold()
                Text("Собеседник печатает…")
                    .font(.subheadline)
                    .foregroundColor(viewModel.isTyping ? .blue : .secondary)
                    .opacity(viewModel.isTyping ? 1 : 0.4)
            }
            Spacer()
            Image(systemName: "ellipsis.message")
                .font(.title2)
                .foregroundColor(.blue)
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    private var messageComposer: some View {
        VStack(spacing: 8) {
            Divider()
            HStack(spacing: 12) {
                TextField("Сообщение", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .focused($isInputFocused)

                Button(action: sendMessage) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(inputText.isEmpty ? .gray : .white)
                        .padding(10)
                        .background(inputText.isEmpty ? Color(.systemGray5) : Color.blue)
                        .clipShape(Circle())
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .background(.ultraThinMaterial)
    }

    private var typingIndicator: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color.gray.opacity(0.3))
                .frame(width: 36, height: 36)
                .overlay(
                    HStack(spacing: 4) {
                        ForEach(0..<3) { index in
                            Circle()
                                .fill(Color.gray.opacity(0.6))
                                .frame(width: 6, height: 6)
                                .scaleEffect(viewModel.isTyping ? 1 : 0.8)
                                .animation(
                                    .easeInOut(duration: 0.6)
                                        .repeatForever()
                                        .delay(Double(index) * 0.2),
                                    value: viewModel.isTyping
                                )
                        }
                    }
                )

            Text("Собеседник печатает…")
                .font(.footnote)
                .foregroundColor(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color(.systemGray6))
                .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        inputText = ""
        isInputFocused = false
        viewModel.sendMessage(text: trimmed)
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastID = viewModel.messages.last?.id else { return }
        withAnimation {
            proxy.scrollTo(lastID, anchor: .bottom)
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 4) {
            Text(message.text)
                .padding(12)
                .background(message.isOutgoing ? Color.blue : Color(.systemGray5))
                .foregroundColor(message.isOutgoing ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)

            if message.isOutgoing {
                Text(message.status.rawValue)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
    }
}

#Preview("Диалог") {
    DialogueView()
}
