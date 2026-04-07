import SwiftUI
import UIKit

@MainActor
struct DialogueView: View {
    @StateObject private var viewModel: ChatViewModel
    @State private var aiResponse: String = ""
    @State private var isWaitingForAI: Bool = false

    private let aiChatID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!

    @MainActor
    init(chatID: UUID, title: String, container: AppContainer? = nil) {
        let container = container ?? .shared
        _viewModel = StateObject(wrappedValue: container.makeChatViewModel(chatID: chatID, title: title))
    }

    var body: some View {
        Group {
            if viewModel.chatID == aiChatID {
                AIChatView(aiResponse: $aiResponse, isWaitingForAI: $isWaitingForAI)
            } else {
                chatView
                    .navigationTitle(viewModel.title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
    }

    private var chatView: some View {
        VStack(spacing: 0) {
            if let banner = viewModel.banner {
                bannerView(for: banner)
                    .transition(.move(edge: .top))
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages, id: \.id) { message in
                            MessageBubbleView(message: message)
                                .id(message.id.messageID)
                                .padding(.horizontal)
                                .onAppear {
                                    if message == viewModel.messages.last {
                                        viewModel.markAsRead(messageID: message.id.messageID)
                                    }
                                }
                        }
                    }
                    .padding(.vertical, 12)
                }
                .background(Color(uiColor: .systemGroupedBackground))
                .onChange(of: viewModel.messages.count) {
                    if let last = viewModel.messages.last {
                        withAnimation(.easeInOut) {
                            proxy.scrollTo(last.id.messageID, anchor: .bottom)
                        }
                    }
                }
            }

            messageInput
                .background(VisualEffectView(style: .systemMaterial))
        }
    }

    private var messageInput: some View {
        HStack(alignment: .bottom, spacing: 12) {
            TextEditor(text: $viewModel.inputText)
                .frame(minHeight: 36, maxHeight: 120)
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 16).stroke(Color.gray.opacity(0.3)))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                )

            Button(action: viewModel.sendMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .gray : .blue)
            }
            .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
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
                    viewModel.banner = nil
                }
                .foregroundColor(.white)
            }
            .padding()
            .background(Color.red)
        case .offline:
            HStack {
                Image(systemName: "wifi.slash")
                Text("Нет сети. Сообщения будут отправлены при восстановлении связи.")
                Spacer()
            }
            .padding()
            .background(Color.orange)
            .foregroundColor(.white)
        }
    }
}

@MainActor
private struct AIChatView: View {
    @Binding var aiResponse: String
    @Binding var isWaitingForAI: Bool
    @State private var userMessage: String = ""
    @State private var conversationHistory: [(user: String, ai: String)] = []

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(conversationHistory.indices, id: \.self) { index in
                        let exchange = conversationHistory[index]

                        HStack {
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                Text("Вы")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                Text(exchange.user)
                                    .padding()
                                    .background(Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(16)
                            }
                        }
                        .padding(.horizontal)

                        HStack {
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 24))
                                .foregroundColor(.blue)
                                .frame(width: 40, height: 40)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("ИИ Ассистент")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                Text(exchange.ai)
                                    .padding()
                                    .background(Color.blue.opacity(0.1))
                                    .cornerRadius(16)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            Spacer()
                        }
                        .padding(.horizontal)
                    }

                    if !aiResponse.isEmpty && conversationHistory.isEmpty {
                        HStack {
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 24))
                                .foregroundColor(.blue)
                                .frame(width: 40, height: 40)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("ИИ Ассистент")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                Text(aiResponse)
                                    .padding()
                                    .background(Color.blue.opacity(0.1))
                                    .cornerRadius(16)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            Spacer()
                        }
                        .padding(.horizontal)
                    }

                    if isWaitingForAI {
                        HStack {
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 24))
                                .foregroundColor(.blue)
                                .frame(width: 40, height: 40)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("ИИ Ассистент")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                HStack(spacing: 4) {
                                    Circle()
                                        .fill(Color.blue)
                                        .frame(width: 8, height: 8)
                                    Circle()
                                        .fill(Color.blue.opacity(0.6))
                                        .frame(width: 8, height: 8)
                                    Circle()
                                        .fill(Color.blue.opacity(0.3))
                                        .frame(width: 8, height: 8)
                                }
                                .padding()
                                .background(Color.blue.opacity(0.1))
                                .cornerRadius(16)
                            }
                            Spacer()
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical)
            }

            HStack(spacing: 12) {
                TextField("Спросите у ИИ...", text: $userMessage)
                    .padding()
                    .background(Color.gray.opacity(0.2))
                    .cornerRadius(20)
                    .disabled(isWaitingForAI)

                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(userMessage.isEmpty || isWaitingForAI ? .gray : .blue)
                }
                .disabled(userMessage.isEmpty || isWaitingForAI)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(uiColor: .systemBackground))
        }
        .navigationTitle("🤖 ИИ Ассистент")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: clearHistory) {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                }
            }
        }
    }

    private func sendMessage() {
        guard !userMessage.isEmpty else { return }
        let currentMessage = userMessage
        isWaitingForAI = true
        aiResponse = ""

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8 + Double.random(in: 0...1.2)) {
            let response = generateAIResponse(for: currentMessage.lowercased(), history: conversationHistory)
            conversationHistory.append((user: currentMessage, ai: response))
            aiResponse = response
            isWaitingForAI = false
            userMessage = ""
        }
    }

    private func generateAIResponse(for message: String, history: [(user: String, ai: String)]) -> String {
        if history.contains(where: { $0.user.lowercased().contains(message) }) {
            return ["Я уже отвечал на этот вопрос раньше! 😊", "Как я помню, мы уже обсуждали это.", "Повторяю свой предыдущий ответ..."].randomElement()!
        }

        if history.count > 5 {
            if message.contains("итог") || message.contains("резюме") || message.contains("summary") {
                return "Мы обсудили уже \(history.count) тем! Хотите начать новый разговор или продолжить?"
            }
        }

        if history.isEmpty && (message.contains("привет") || message.contains("hello") || message.contains("hi")) {
            return ["Привет! 👋 Я ИИ ассистент этого мессенджера. Чем могу помочь?", "Здравствуйте! Рад познакомиться! Я здесь, чтобы помочь с приложением.", "Привет! Я ИИ помощник. Спросите меня о чем угодно!"].randomElement()!
        }

        if !history.isEmpty && (message.contains("привет") || message.contains("hello") || message.contains("hi")) {
            return ["Привет еще раз! 😊", "Рад вас снова видеть!", "Здравствуйте! Продолжим разговор?"].randomElement()!
        }

        if message.contains("что ты умеешь") || message.contains("что ты можешь") || message.contains("функции") {
            return "Я могу помочь с:\n• 💬 Общением в чатах\n• 📱 Использованием приложения\n• 🔧 Решением проблем\n• 💡 Полезными советами\n• 🕒 Текущим временем\n• 🎭 Шутками\n\nСпроси меня о чем угодно! 😊"
        }

        if message.contains("как создать чат") || message.contains("новый чат") {
            return "Чтобы создать новый чат:\n1. Нажмите кнопку '+' в правом верхнем углу списка чатов\n2. Выберите контакт или введите имя\n3. Начните общение!\n\nЛегко и просто! 😉"
        }

        if message.contains("профиль") || message.contains("настройки") {
            return "В разделе 'Профиль' вы можете:\n• 👤 Посмотреть свою информацию\n• 🔔 Настроить уведомления\n• 🌙 Выбрать тему\n• 🚪 Выйти из аккаунта\n\nХотите, я расскажу подробнее о чем-то конкретном?"
        }

        if message.contains("уведомлен") || message.contains("пуш") {
            return "Уведомления в приложении:\n• 🔔 Входящие сообщения\n• 👥 Упоминания в групповых чатах\n• 🔕 Режим 'Не беспокоить'\n• 📱 Настройки в профиле\n\nХотите настроить уведомления?"
        }

        if message.contains("тема") || message.contains("дизайн") {
            return "Приложение поддерживает:\n• 🌞 Светлую тему\n• 🌙 Темную тему\n• 🔄 Автоматическое переключение\n\nТемы настраиваются в профиле! 🎨"
        }

        if message.contains("время") || message.contains("дата") || message.contains("сколько времени") {
            let formatter = DateFormatter()
            formatter.dateStyle = .long
            formatter.timeStyle = .short
            formatter.locale = Locale(identifier: "ru_RU")
            return "Сейчас \(formatter.string(from: Date()))"
        }

        if message.contains("сколько") || message.contains("вычисли") || message.contains("посчитай") {
            return "Я пока не умею считать, но могу подсказать, где найти калькулятор в вашем iPhone! 📱"
        }

        if message.contains("погода") || message.contains("weather") {
            return "Я не могу проверять погоду в реальном времени, но рекомендую использовать приложение 'Погода' на вашем iPhone! ☀️"
        }

        if message.contains("шутк") || message.contains("анекдот") || message.contains("смешн") {
            let jokes = [
                "Почему программисты не любят природу? Слишком много багов! 🐛",
                "Что говорит iOS разработчик на пляже? 'У меня нет приложений для загара!' 📱",
                "Почему мессенджер всегда спокоен? Потому что у него есть 'не беспокоить'! 😴"
            ]
            return jokes.randomElement()!
        }

        if message.contains("помощь") || message.contains("help") || message.contains("не знаю") {
            return "Я здесь, чтобы помочь! 🤝\n\nПопробуйте спросить:\n• 'Как создать чат?'\n• 'Что ты умеешь?'\n• 'Расскажи о профиле'\n• Или просто поздоровайтесь! 👋"
        }

        if message.contains("спасибо") || message.contains("thank") || message.contains("благодар") {
            return ["Пожалуйста! 😊", "Всегда рад помочь!", "Не за что! Если будут еще вопросы - спрашивайте."].randomElement()!
        }

        let unknownResponses = [
            "Интересный вопрос! 🤔 Могу я уточнить - вы имеете в виду что-то связанное с приложением?",
            "Хм, я не совсем понял. Может, спросите по-другому или расскажите подробнее? 💭",
            "Это сложный вопрос для меня. Попробуйте спросить о чатах, настройках или функциях приложения! 📱",
            "Я пока не знаю ответа на этот вопрос, но обязательно научусь! А пока давайте поговорим о мессенджере? 😊",
            "Не уверен, что правильно понял. Вы хотели узнать о:\n• 💬 Создании чатов?\n• 👤 Настройках профиля?\n• 🔔 Уведомлениях?\n• 🎨 Темах оформления?"
        ]

        return unknownResponses.randomElement()!
    }

    private func clearHistory() {
        conversationHistory.removeAll()
        aiResponse = ""
    }
}

private struct MessageBubbleView: View {
    let message: Message

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !message.isOutgoing {
                avatarView
            }

            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 4) {
                if let repliedTo = message.repliedTo {
                    Text("Ответ на сообщение \(repliedTo.messageID.uuidString.prefix(4))…")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(8)
                }

                Text(message.text)
                    .padding(12)
                    .background(message.isOutgoing ? Color.blue : Color.gray.opacity(0.2))
                    .foregroundColor(message.isOutgoing ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .frame(maxWidth: 250, alignment: message.isOutgoing ? .trailing : .leading)

                HStack(spacing: 4) {
                    Text(message.createdAt, style: .time)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    if message.isOutgoing {
                        MessageStatusView(status: message.status)
                    }
                }
            }

            if message.isOutgoing {
                avatarView
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
        .padding(.horizontal)
        .transition(.asymmetric(insertion: .move(edge: message.isOutgoing ? .trailing : .leading), removal: .opacity))
    }

    private var avatarView: some View {
        Circle()
            .fill(Color.blue.opacity(0.3))
            .frame(width: 32, height: 32)
            .overlay(
                Text(message.authorName.prefix(1).uppercased())
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.blue)
            )
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
