import SwiftUI

@MainActor
struct DialogueView: View {
    @StateObject private var viewModel: ChatViewModel
    @State private var aiResponse = ""
    @State private var isWaitingForAI = false
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

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
                    .navigationTitle("")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
    }

    private var chatView: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(uiColor: .systemGroupedBackground),
                    Color.blue.opacity(0.05),
                    Color(uiColor: .systemBackground)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                heroHeader
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                if let banner = viewModel.banner {
                    bannerView(for: banner)
                        .padding(.horizontal, 20)
                        .padding(.top, 10)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }

                messageList
                composer
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
            }
        }
    }

    private var heroHeader: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    Color(red: 0.00, green: 0.48, blue: 1.00),
                    Color(red: 0.20, green: 0.55, blue: 0.98),
                    Color(red: 0.35, green: 0.34, blue: 0.84)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 154)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(Color.white.opacity(0.14))
                    .frame(width: 140, height: 140)
                    .offset(x: 28, y: -34)
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(viewModel.title)
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        Text(headerSubtitle)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.white.opacity(0.84))
                    }

                    Spacer(minLength: 16)

                    Label(t("Активен", "Active"), systemImage: "waveform.path.ecg")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.16), in: Capsule())
                }

                HStack(spacing: 10) {
                    HeaderPill(title: t("Сообщений", "Messages"), value: "\(viewModel.messages.count)")
                    HeaderPill(title: t("Статус", "Status"), value: viewModel.isLoadingHistory ? t("Загрузка", "Loading") : t("Онлайн", "Online"))
                }
            }
            .padding(22)
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 14) {
                    if viewModel.isLoadingHistory && viewModel.messages.isEmpty {
                        loadingState
                    } else if viewModel.messages.isEmpty {
                        emptyState
                    } else {
                        ForEach(Array(viewModel.messages.enumerated()), id: \.element.id.messageID) { item in
                            if shouldShowDateSeparator(at: item.offset) {
                                DateChip(date: item.element.createdAt)
                            }

                            MessageBubbleView(message: item.element)
                                .id(item.element.id.messageID)
                                .onAppear {
                                    if item.element == viewModel.messages.last {
                                        viewModel.markAsRead(messageID: item.element.id.messageID)
                                    }
                                }
                        }
                    }

                    if viewModel.isTyping {
                        TypingBubbleView()
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                if let last = viewModel.messages.last {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        proxy.scrollTo(last.id.messageID, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
            Text(t("Подгружаем историю диалога", "Loading conversation history"))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 56)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.text.bubble.right.fill")
                .font(.system(size: 34))
                .foregroundStyle(.blue)

            Text(t("Диалог пока пуст", "The chat is empty"))
                .font(.headline)

            Text(t("Напишите первое сообщение и начните разговор красиво.", "Send the first message and start the conversation in style."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 20)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 12) {
            ZStack(alignment: .topLeading) {
                if trimmedInput.isEmpty {
                    Text(t("Сообщение...", "Message..."))
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                }

                TextEditor(text: $viewModel.inputText)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 52, maxHeight: 118)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.clear)
            }
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            Button(action: viewModel.sendMessage) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 50, height: 50)
                    .background(
                        LinearGradient(
                            colors: trimmedInput.isEmpty ? [Color.gray.opacity(0.55), Color.gray.opacity(0.42)] : [Color.blue, Color.indigo],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: Circle()
                    )
                    .shadow(color: trimmedInput.isEmpty ? .clear : Color.blue.opacity(0.22), radius: 16, y: 10)
            }
            .disabled(trimmedInput.isEmpty)
        }
        .padding(10)
        .background(Color(uiColor: .systemBackground).opacity(0.96), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.primary.opacity(0.05), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 18, y: 10)
    }

    @ViewBuilder
    private func bannerView(for banner: ChatViewModel.Banner) -> some View {
        switch banner {
        case .error(let message):
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.white)

                Text(message)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white)

                Spacer()

                Button(t("Повторить", "Retry")) {
                    viewModel.retryFailedMessages()
                    viewModel.banner = nil
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
            }
            .padding(14)
            .background(Color.red, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        case .offline:
            HStack(spacing: 12) {
                Image(systemName: "wifi.slash")
                Text(t("Нет сети. Сообщения отправятся сразу после восстановления соединения.", "No network. Messages will be sent as soon as the connection is back."))
                    .font(.footnote.weight(.medium))
                Spacer()
            }
            .padding(14)
            .foregroundStyle(.white)
            .background(Color.orange, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private var headerSubtitle: String {
        if viewModel.isLoadingHistory {
            return t("Синхронизируем переписку и статусы сообщений.", "Syncing messages and delivery statuses.")
        }
        if viewModel.messages.isEmpty {
            return t("Новый диалог готов к первому сообщению.", "This conversation is ready for the first message.")
        }
        return t("Гладкий чат с быстрым вводом, статусами и живыми пузырями.", "A polished chat with quick input, statuses and lively message bubbles.")
    }

    private var trimmedInput: String {
        viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func shouldShowDateSeparator(at index: Int) -> Bool {
        guard index > 0 else { return true }
        let previous = viewModel.messages[index - 1]
        let current = viewModel.messages[index]
        return !Calendar.current.isDate(previous.createdAt, inSameDayAs: current.createdAt)
    }

    private var language: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }

    private func t(_ ru: String, _ en: String) -> String {
        language.text(ru: ru, en: en)
    }
}

@MainActor
private struct AIChatView: View {
    @Binding var aiResponse: String
    @Binding var isWaitingForAI: Bool
    @State private var userMessage = ""
    @State private var conversationHistory: [(user: String, ai: String)] = []
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(uiColor: .systemGroupedBackground),
                    Color.blue.opacity(0.05),
                    Color(uiColor: .systemBackground)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                aiHeader
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                ScrollView {
                    VStack(spacing: 16) {
                        if conversationHistory.isEmpty && aiResponse.isEmpty && !isWaitingForAI {
                            VStack(spacing: 12) {
                                Image(systemName: "brain.head.profile")
                                    .font(.system(size: 34))
                                    .foregroundStyle(.blue)

                                Text(t("ИИ ассистент готов к диалогу", "AI assistant is ready to chat"))
                                    .font(.headline)

                                Text(t("Спросите про чат, профиль, уведомления или просто начните разговор.", "Ask about chats, profile, notifications or just start a conversation."))
                                    .font(.subheadline)
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 42)
                            .padding(.horizontal, 20)
                            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        }

                        ForEach(conversationHistory.indices, id: \.self) { index in
                            ConversationExchangeRow(exchange: conversationHistory[index])
                        }

                        if !aiResponse.isEmpty && conversationHistory.isEmpty {
                            AssistantBubble(text: aiResponse)
                        }

                        if isWaitingForAI {
                            TypingBubbleView(title: t("ИИ Ассистент", "AI Assistant"))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }

                aiComposer
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
            }
        }
        .navigationTitle(t("ИИ Ассистент", "AI Assistant"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var aiHeader: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    Color(red: 0.00, green: 0.48, blue: 1.00),
                    Color(red: 0.24, green: 0.51, blue: 0.95),
                    Color(red: 0.35, green: 0.34, blue: 0.84)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(Color.white.opacity(0.14))
                    .frame(width: 130, height: 130)
                    .offset(x: 24, y: -28)
            }

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(t("ИИ Ассистент", "AI Assistant"))
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text(t("Подсказывает по мессенджеру, интерфейсу и базовым сценариям.", "Helps with the messenger, interface and core flows."))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.white.opacity(0.84))
                    }

                    Spacer()

                    Button(action: clearHistory) {
                        Image(systemName: "trash")
                            .foregroundStyle(.white)
                            .padding(12)
                            .background(Color.white.opacity(0.16), in: Circle())
                    }
                }

                HeaderPill(title: t("Диалогов", "Dialogs"), value: "\(conversationHistory.count)")
            }
            .padding(22)
        }
    }

    private var aiComposer: some View {
        HStack(alignment: .center, spacing: 12) {
            TextField(t("Спросите у ИИ...", "Ask the AI..."), text: $userMessage)
                .textInputAutocapitalization(.sentences)
                .padding(.horizontal, 18)
                .frame(height: 52)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .disabled(isWaitingForAI)

            Button(action: sendMessage) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 50, height: 50)
                    .background(
                        LinearGradient(
                            colors: userMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWaitingForAI ? [Color.gray.opacity(0.55), Color.gray.opacity(0.42)] : [Color.blue, Color.indigo],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: Circle()
                    )
            }
            .disabled(userMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWaitingForAI)
        }
        .padding(10)
        .background(Color(uiColor: .systemBackground).opacity(0.96), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.primary.opacity(0.05), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 18, y: 10)
    }

    private func sendMessage() {
        let trimmed = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isWaitingForAI = true
        aiResponse = ""

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8 + Double.random(in: 0...1.2)) {
            let response = generateAIResponse(for: trimmed.lowercased(), history: conversationHistory)
            conversationHistory.append((user: trimmed, ai: response))
            aiResponse = response
            isWaitingForAI = false
            userMessage = ""
        }
    }

    private func clearHistory() {
        conversationHistory.removeAll()
        aiResponse = ""
    }

    private func generateAIResponse(for message: String, history: [(user: String, ai: String)]) -> String {
        if history.contains(where: { $0.user.lowercased().contains(message) }) {
            return language.isRussian
                ? ["Я уже отвечал на этот вопрос раньше! 😊", "Как я помню, мы уже обсуждали это.", "Повторяю свой предыдущий ответ..."].randomElement()!
                : ["I've answered that before. 😊", "If I remember correctly, we've already discussed this.", "Repeating my previous answer..."].randomElement()!
        }

        if history.count > 5, message.contains("итог") || message.contains("резюме") || message.contains("summary") {
            return t("Мы обсудили уже \(history.count) тем. Хотите продолжить разговор или начать новую тему?", "We've already discussed \(history.count) topics. Want to continue or start a new one?")
        }

        if history.isEmpty && (message.contains("привет") || message.contains("hello") || message.contains("hi")) {
            return language.isRussian
                ? ["Привет! Я ИИ ассистент этого мессенджера. Чем могу помочь?", "Здравствуйте! Рад познакомиться. Я здесь, чтобы помочь с приложением.", "Привет! Я ИИ помощник. Спросите меня о чем угодно."].randomElement()!
                : ["Hi! I'm the AI assistant for this messenger. How can I help?", "Hello! Nice to meet you. I'm here to help with the app.", "Hi! I'm the AI helper. Ask me anything."].randomElement()!
        }

        if !history.isEmpty && (message.contains("привет") || message.contains("hello") || message.contains("hi")) {
            return language.isRussian
                ? ["Привет еще раз.", "Рад вас снова видеть.", "Здравствуйте! Продолжим разговор?"].randomElement()!
                : ["Hello again.", "Nice to see you again.", "Hi! Shall we continue?"].randomElement()!
        }

        if message.contains("что ты умеешь") || message.contains("что ты можешь") || message.contains("функции") {
            return t("Я могу помочь с чатами, профилем, настройками уведомлений, темой интерфейса и базовой навигацией по приложению.", "I can help with chats, profile, notification settings, interface theme and the basic navigation of the app.")
        }

        if message.contains("как создать чат") || message.contains("новый чат") {
            return t("Чтобы создать новый чат, нажмите кнопку с карандашом в правом верхнем углу списка чатов, затем выберите собеседника и начните диалог.", "To create a new chat, tap the pencil button in the top right corner of the chat list, then pick a contact and start talking.")
        }

        if message.contains("профиль") || message.contains("настройки") {
            return t("В профиле можно посмотреть свою информацию, переключить тему, включить quiet hours и выйти из аккаунта.", "In profile you can review your info, change the theme, enable quiet hours and sign out.")
        }

        if message.contains("уведомлен") || message.contains("пуш") {
            return t("Уведомления можно включать и выключать в профиле. Там же доступны quiet hours, чтобы временно скрыть локальные алерты.", "Notifications can be turned on and off in the profile. Quiet hours are also available there to temporarily mute local alerts.")
        }

        if message.contains("тема") || message.contains("дизайн") {
            return t("Сейчас доступны три режима: авто, светлая и тёмная тема. Переключение сохраняется между запусками приложения.", "Three modes are available now: auto, light and dark theme. Your choice is saved between launches.")
        }

        if message.contains("время") || message.contains("дата") || message.contains("сколько времени") {
            let formatter = DateFormatter()
            formatter.dateStyle = .long
            formatter.timeStyle = .short
            formatter.locale = language.locale
            return t("Сейчас \(formatter.string(from: Date()))", "It is now \(formatter.string(from: Date()))")
        }

        if message.contains("погода") || message.contains("weather") {
            return t("Погоду в реальном времени я не проверяю, но могу подсказать, где в приложении настроить уведомления и тему.", "I can't check the live weather, but I can show you where to configure notifications and theme settings in the app.")
        }

        if message.contains("шутк") || message.contains("анекдот") || message.contains("смешн") {
            let jokes = language.isRussian
                ? [
                    "Почему программисты не любят природу? Слишком много багов.",
                    "Почему мессенджер всегда спокоен? Потому что у него есть режим не беспокоить.",
                    "Что говорит iOS-разработчик на пляже? У меня нет приложения для загара."
                ]
                : [
                    "Why don't programmers like nature? Too many bugs.",
                    "Why is the messenger always calm? Because it has Do Not Disturb.",
                    "What does an iOS developer say at the beach? I don't have an app for tanning."
                ]
            return jokes.randomElement()!
        }

        if message.contains("помощь") || message.contains("help") || message.contains("не знаю") {
            return t("Я здесь, чтобы помочь. Попробуйте спросить: как создать чат, что умеет приложение, где включить тему или как настроить уведомления.", "I'm here to help. Try asking how to create a chat, what the app can do, where to enable the theme or how to configure notifications.")
        }

        if message.contains("спасибо") || message.contains("thank") || message.contains("благодар") {
            return language.isRussian
                ? ["Пожалуйста.", "Всегда рад помочь.", "Не за что. Если будут еще вопросы, спрашивайте."].randomElement()!
                : ["You're welcome.", "Always happy to help.", "No problem. If you have more questions, just ask."].randomElement()!
        }

        let unknownResponses = language.isRussian
            ? [
                "Интересный вопрос. Если хотите, могу подсказать по чатам, профилю или настройкам приложения.",
                "Хм, я не до конца понял. Попробуйте переформулировать вопрос чуть подробнее.",
                "Я лучше всего помогаю с функциями мессенджера, темой, уведомлениями и навигацией."
            ]
            : [
                "Interesting question. If you want, I can help with chats, profile or app settings.",
                "Hmm, I didn't fully get that. Try rephrasing it with a bit more detail.",
                "I'm best at helping with messenger features, theme, notifications and navigation."
            ]

        return unknownResponses.randomElement()!
    }

    private var language: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }

    private func t(_ ru: String, _ en: String) -> String {
        language.text(ru: ru, en: en)
    }
}

private struct HeaderPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.white.opacity(0.68))
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct DateChip: View {
    let date: Date

    var body: some View {
        Text(formattedDate)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(uiColor: .secondarySystemBackground), in: Capsule())
            .frame(maxWidth: .infinity)
    }

    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.locale = AppLanguagePreference.current.locale
        formatter.setLocalizedDateFormatFromTemplate("d MMM")
        return formatter.string(from: date)
    }
}

private struct MessageBubbleView: View {
    let message: Message

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            if !message.isOutgoing {
                avatar
            } else {
                Spacer(minLength: 36)
            }

            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 6) {
                if let repliedTo = message.repliedTo {
                    Text(AppLanguagePreference.localized(ru: "Ответ на \(repliedTo.messageID.uuidString.prefix(4))...", en: "Reply to \(repliedTo.messageID.uuidString.prefix(4))..."))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.primary.opacity(0.06), in: Capsule())
                }

                Text(message.text)
                    .font(.body)
                    .foregroundStyle(message.isOutgoing ? .white : .primary)
                    .padding(.horizontal, 15)
                    .padding(.vertical, 12)
                    .background(bubbleBackground)
                    .frame(maxWidth: 290, alignment: message.isOutgoing ? .trailing : .leading)
                    .shadow(color: message.isOutgoing ? Color.blue.opacity(0.14) : Color.black.opacity(0.05), radius: 12, y: 8)

                HStack(spacing: 5) {
                    Text(message.createdAt, style: .time)
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if message.isOutgoing {
                        MessageStatusView(status: message.status)
                    }
                }
                .padding(.horizontal, 4)
            }

            if message.isOutgoing {
                avatar
            } else {
                Spacer(minLength: 36)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
    }

    private var avatar: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: message.isOutgoing ? [Color.blue, Color.indigo] : [Color.blue.opacity(0.20), Color.indigo.opacity(0.18)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 34, height: 34)
            .overlay(
                Text(message.authorName.prefix(1).uppercased())
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(message.isOutgoing ? .white : .blue)
            )
    }

    @ViewBuilder
    private var bubbleBackground: some View {
        if message.isOutgoing {
            LinearGradient(
                colors: [Color.blue, Color.indigo],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground))
        }
    }
}

private struct TypingBubbleView: View {
    var title = AppLanguagePreference.localized(ru: "Собеседник", en: "Contact")

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Circle()
                .fill(LinearGradient(colors: [Color.blue.opacity(0.20), Color.indigo.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 34, height: 34)
                .overlay(
                    Image(systemName: "ellipsis.message.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.blue)
                )

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)

                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { index in
                        Circle()
                            .fill(index == 0 ? Color.blue : Color.blue.opacity(0.35 + Double(index) * 0.12))
                            .frame(width: 8, height: 8)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }

            Spacer()
        }
    }
}

private struct ConversationExchangeRow: View {
    let exchange: (user: String, ai: String)

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Spacer(minLength: 34)
                VStack(alignment: .trailing, spacing: 6) {
                    Text(AppLanguagePreference.localized(ru: "Вы", en: "You"))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text(exchange.user)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 15)
                        .padding(.vertical, 12)
                        .background(
                            LinearGradient(colors: [Color.blue, Color.indigo], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
                        )
                }
            }

            AssistantBubble(text: exchange.ai)
        }
    }
}

private struct AssistantBubble: View {
    let text: String

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Circle()
                .fill(LinearGradient(colors: [Color.blue.opacity(0.20), Color.indigo.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 34, height: 34)
                .overlay(
                    Image(systemName: "brain.head.profile")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.blue)
                )

            VStack(alignment: .leading, spacing: 6) {
                Text(AppLanguagePreference.localized(ru: "ИИ Ассистент", en: "AI Assistant"))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)

                Text(text)
                    .padding(.horizontal, 15)
                    .padding(.vertical, 12)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer()
        }
    }
}
