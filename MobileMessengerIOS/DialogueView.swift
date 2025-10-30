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
    @State private var messages: [ChatMessage] = [
        ChatMessage(text: "Привет! Как дела?", isOutgoing: true, status: .read),
        ChatMessage(text: "Привет! Все хорошо, спасибо", isOutgoing: false, status: .delivered),
        ChatMessage(text: "Когда встретимся?", isOutgoing: true, status: .delivered),
        ChatMessage(text: "Давай завтра вечером", isOutgoing: false, status: .delivered)
    ]
    @State private var inputText: String = ""
    @State private var isTyping = false
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            conversationHeader

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if isTyping {
                            typingIndicator
                                .transition(.opacity)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(Color(.systemGroupedBackground))
                .onChange(of: messages.count) { _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: isTyping) { _ in
                    scrollToBottom(proxy: proxy)
                }
            }

            messageComposer
        }
        .animation(.easeInOut, value: messages)
        .animation(.easeInOut, value: isTyping)
    }

    private var conversationHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Диалог")
                    .font(.title2)
                    .bold()
                Text("Собеседник печатает…")
                    .font(.subheadline)
                    .foregroundColor(isTyping ? .blue : .secondary)
                    .opacity(isTyping ? 1 : 0.4)
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
                                .scaleEffect(isTyping ? 1 : 0.8)
                                .animation(
                                    .easeInOut(duration: 0.6)
                                        .repeatForever()
                                        .delay(Double(index) * 0.2),
                                    value: isTyping
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

        var newMessage = ChatMessage(text: trimmed, isOutgoing: true, status: .sending)
        messages.append(newMessage)
        inputText = ""
        isInputFocused = false

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            updateStatus(for: newMessage.id, to: .sent)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            updateStatus(for: newMessage.id, to: .delivered)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            updateStatus(for: newMessage.id, to: .read)
        }

        simulateIncomingMessage()
    }

    private func updateStatus(for id: UUID, to status: ChatMessage.DeliveryStatus) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].status = status
    }

    private func simulateIncomingMessage() {
        isTyping = true

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation {
                isTyping = false
            }
            let response = ChatMessage(
                text: "Отлично! Тогда созвонимся позже.",
                isOutgoing: false,
                status: .delivered
            )
            messages.append(response)
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastID = messages.last?.id else { return }
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
