import SwiftUI
import Combine

struct AuthView: View {
    @StateObject private var viewModel: AuthViewModel
    @ObservedObject private var container: AppContainer
    @Environment(\.openURL) private var openURL
    @FocusState private var focusedField: AuthField?
    @State private var isDemoAccountsExpanded = false
    @State private var isBackendSupportExpanded = false
    let onAuthorized: () -> Void

    private enum AuthField: Hashable {
        case contact
        case code
    }

    @MainActor
    init(onAuthorized: @escaping () -> Void) {
        self.init(container: .shared, onAuthorized: onAuthorized)
    }

    @MainActor
    init(container: AppContainer, onAuthorized: @escaping () -> Void) {
        _container = ObservedObject(wrappedValue: container)
        _viewModel = StateObject(wrappedValue: container.makeAuthViewModel())
        self.onAuthorized = onAuthorized
    }

    var body: some View {
        ZStack {
            AuthenticationBackdrop()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    heroSection
                    authCard
                }
                .frame(maxWidth: 560, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeInOut(duration: 0.2), value: viewModel.screenMode)
        .animation(.easeInOut(duration: 0.2), value: viewModel.credentialMode)
        .animation(.easeInOut(duration: 0.2), value: viewModel.isCodeSent)
        .animation(.easeInOut(duration: 0.2), value: viewModel.telegramPairingExpiresIn)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Готово") {
                    focusedField = nil
                }
            }
        }
        .onChange(of: viewModel.isCodeSent) { _, isCodeSent in
            guard isCodeSent else { return }
            focusedField = .code
        }
        .onReceive(viewModel.sessionStore.$state) { state in
            if case .authenticated = state {
                onAuthorized()
            }
        }
    }

    private var heroSection: some View {
        HStack(spacing: 16) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AppTheme.primary, AppTheme.aqua],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 64, height: 64)
                .overlay {
                    Image(systemName: "message.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                }
                .shadow(color: AppTheme.primary.opacity(0.40), radius: 18, y: 8)

            VStack(alignment: .leading, spacing: 5) {
                Text("Вход в Mobile Messenger")
                    .font(.system(size: 27, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Text("Введите номер — одноразовый код придёт в Telegram.")
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.76))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var authCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            progressSection

            if let lastUsedLogin = viewModel.lastUsedLogin,
               lastUsedLogin.demoAccount != nil {
                quickResumeSection(lastUsedLogin)
            }

            contactField
            codeSection

            if let error = viewModel.errorMessage {
                errorCard(error)
            }

            if shouldShowBackendSupport {
                backendSupportSection
            }

            if viewModel.isDemoAuthAvailable {
                demoAccountsSection
            }
        }
        .padding(18)
        .background(AuthenticationCardSurface(cornerRadius: 28))
    }

    private var currentStep: Int {
        if viewModel.isCodeSent { return 3 }
        if viewModel.telegramPairingExpiresIn != nil { return 2 }
        return 1
    }

    private var progressSection: some View {
        HStack(spacing: 8) {
            progressItem(number: 1, title: "Номер")
            progressConnector(after: 1)
            progressItem(number: 2, title: "Telegram")
            progressConnector(after: 2)
            progressItem(number: 3, title: "Код")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Шаг \(currentStep) из 3")
    }

    private func progressItem(number: Int, title: String) -> some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(number <= currentStep ? AppTheme.primary : Color.white.opacity(0.10))
                    .frame(width: 30, height: 30)

                if number < currentStep {
                    Image(systemName: "checkmark")
                        .font(.caption.bold())
                } else {
                    Text("\(number)")
                        .font(.caption.bold())
                }
            }

            Text(title)
                .font(.caption.weight(number == currentStep ? .bold : .medium))
                .foregroundStyle(Color.white.opacity(number <= currentStep ? 0.95 : 0.45))
        }
        .foregroundStyle(.white)
        .frame(minWidth: 58)
    }

    private func progressConnector(after step: Int) -> some View {
        Capsule()
            .fill(step < currentStep ? AppTheme.primary : Color.white.opacity(0.12))
            .frame(maxWidth: .infinity)
            .frame(height: 3)
            .offset(y: -10)
    }

    private var contactHint: String {
        if viewModel.contact.isEmpty {
            return "В международном формате, например +375291234567"
        }
        if viewModel.isContactValid {
            return "Номер заполнен — можно перейти к Telegram"
        }
        return "Проверьте формат: номер должен начинаться с +"
    }

    private var contactHintColor: Color {
        guard !viewModel.contact.isEmpty else { return Color.white.opacity(0.55) }
        return viewModel.isContactValid ? AppTheme.aqua : Color(red: 1.0, green: 0.60, blue: 0.60)
    }

    private func errorCard(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(Color(red: 1.0, green: 0.60, blue: 0.60))

            Text(message)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.white.opacity(0.90))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.red.opacity(0.13))
        )
    }

    private func statusCard(title: String, message: String, systemImage: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AppTheme.aqua)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.66))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AuthenticationCardSurface(cornerRadius: 18, fill: Color(red: 0.07, green: 0.14, blue: 0.24)))
    }

    private var contactField: some View {
        VStack(alignment: .leading, spacing: 10) {
            fieldLabel("1. Ваш номер телефона", systemImage: "iphone")
            TextField(
                "+375 29 123-45-67",
                text: Binding(
                    get: { viewModel.contact },
                    set: viewModel.updateContact
                )
            )
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 18, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 58)
                .background(fieldBackground)
                .focused($focusedField, equals: .contact)

            Text(contactHint)
                .font(.footnote)
                .foregroundStyle(contactHintColor)
        }
    }

    private var codeSection: some View {
        Group {
            if viewModel.isCodeSent {
                verificationSection
            } else if viewModel.telegramPairingExpiresIn != nil {
                pairingConfirmationSection
            } else {
                telegramStartSection
            }
        }
    }

    private var telegramStartSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            fieldLabel("2. Получите код в Telegram", systemImage: "paperplane.fill")

            Text("Откроем защищённую ссылку на бота. Отправьте ему свой контакт и вернитесь сюда.")
                .font(.subheadline)
                .foregroundStyle(Color.white.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)

            primaryButton(
                title: "Открыть Telegram",
                systemImage: "paperplane.fill",
                isLoading: viewModel.isLinkingTelegram,
                isEnabled: viewModel.isContactValid && !viewModel.isLinkingTelegram,
                action: linkTelegram
            )

            Button(action: requestCode) {
                Text("Telegram уже привязан? Получить код")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .foregroundStyle(viewModel.isContactValid ? AppTheme.aqua : Color.white.opacity(0.38))
            .disabled(!viewModel.isContactValid || viewModel.isRequestingCode)
        }
    }

    private var pairingConfirmationSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            statusCard(
                title: "Telegram открыт",
                message: "Отправьте боту свой контакт, затем вернитесь и запросите одноразовый код.",
                systemImage: "arrow.up.right.circle.fill"
            )

            primaryButton(
                title: "Я отправил контакт — получить код",
                systemImage: "number.circle.fill",
                isLoading: viewModel.isRequestingCode,
                isEnabled: viewModel.isContactValid && !viewModel.isRequestingCode,
                action: requestCode
            )

            Button(action: linkTelegram) {
                Text("Открыть Telegram ещё раз")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.aqua)
            .disabled(viewModel.isLinkingTelegram)

            if let seconds = viewModel.telegramPairingExpiresIn {
                Text("Защищённая ссылка активна ещё \(seconds) сек.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
            }
        }
    }

    private var verificationSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            fieldLabel("3. Введите код", systemImage: "number.circle.fill")

            TextField("Код из Telegram", text: $viewModel.code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .multilineTextAlignment(.center)
                .font(.system(size: 24, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 58)
                .background(fieldBackground)
                .focused($focusedField, equals: .code)
                .onChange(of: viewModel.code) { _, value in
                    let sanitized = String(value.filter(\.isNumber).prefix(6))
                    if sanitized != value {
                        viewModel.code = sanitized
                    }
                }

            if let seconds = viewModel.codeExpirationSeconds {
                Text("Код действует ещё \(seconds) сек.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
            }

            primaryButton(
                title: "Войти",
                systemImage: "arrow.right.circle.fill",
                isLoading: viewModel.isVerifyingCode,
                isEnabled: viewModel.isCodeValid && !viewModel.isVerifyingCode,
                action: verify
            )

            Button(action: requestCode) {
                Text("Отправить новый код")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.aqua)
            .disabled(viewModel.isRequestingCode)
        }
    }

    private var demoAccountsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                isDemoAccountsExpanded.toggle()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "person.2.fill")
                    Text("Демо-вход для разработки")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(isDemoAccountsExpanded ? 180 : 0))
                }
                .foregroundStyle(.white.opacity(0.82))
            }
            .buttonStyle(.plain)

            if isDemoAccountsExpanded {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 14) {
                        ForEach(viewModel.demoAccounts) { account in
                            DemoAccountCard(
                                account: account,
                                isSelected: account.contact == viewModel.contact
                            ) {
                                viewModel.selectDemoAccount(account)
                            } onQuickSignIn: {
                                Task { await viewModel.signInDemoAccount(account) }
                            }
                            .frame(width: 292)
                        }
                    }
                }

                Text("Демо-аккаунты доступны только в Debug-сборке.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
            }
        }
    }

    private func quickResumeSection(_ lastUsedLogin: AuthLastUsedLogin) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.checkmark")
                .font(.system(size: 28))
                .foregroundStyle(AppTheme.aqua)

            VStack(alignment: .leading, spacing: 2) {
                Text("Продолжить как \(lastUsedLogin.title)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(lastUsedLogin.subtitle)
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.55))
            }

            Spacer(minLength: 0)

            Button("Войти") {
                Task { await viewModel.signInLastUsedDemoAccount() }
            }
            .font(.subheadline.weight(.bold))
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.primary)
        }
        .padding(14)
        .background(AuthenticationCardSurface(cornerRadius: 18, fill: Color(red: 0.07, green: 0.14, blue: 0.24)))
    }

    private var shouldShowBackendSupport: Bool {
        container.isUsingCustomRESTBaseURL
    }

    private var backendSupportSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                isBackendSupportExpanded.toggle()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "wrench.and.screwdriver.fill")
                    Text("Проблемы с подключением?")
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(isBackendSupportExpanded ? 180 : 0))
                }
                .foregroundStyle(Color.white.opacity(0.78))
            }
            .buttonStyle(.plain)

            if isBackendSupportExpanded {
                Text("На устройстве активен кастомный backend. Если вход или Telegram работают нестабильно, вернитесь на встроенный production backend.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.66))
                    .fixedSize(horizontal: false, vertical: true)

                compactActionButton(
                    title: "Сбросить backend",
                    systemImage: "arrow.counterclockwise",
                    prominent: false,
                    action: resetBackendConfiguration
                )
            }
        }
        .padding(.vertical, 4)
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(Color.white.opacity(0.10))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
            }
    }

    private func fieldLabel(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
            Text(title)
                .font(.system(size: 18, weight: .bold, design: .rounded))
        }
        .foregroundStyle(.white)
    }

    private func primaryButton(
        title: String,
        systemImage: String,
        isLoading: Bool,
        isEnabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 20, weight: .semibold))
                }

                Text(title)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
            .frame(height: 58)
        }
        .buttonStyle(
            LiquidGlassProminentButtonStyle(
                tint: AppTheme.primary,
                secondaryTint: AppTheme.coral,
                height: 58
            )
        )
        .disabled(!isEnabled)
    }

    private func compactActionButton(
        title: String,
        systemImage: String,
        prominent: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .semibold))

                Text(title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
            }
            .frame(height: 54)
        }
        .modifier(
            CompactActionButtonStyleModifier(prominent: prominent)
        )
    }

    private func segment<Value: Hashable>(
        items: [Value],
        selected: Value,
        title: KeyPath<Value, String>,
        action: @escaping (Value) -> Void
    ) -> some View {
        HStack(spacing: 10) {
            ForEach(items, id: \.self) { item in
                Button {
                    action(item)
                } label: {
                    Text(item[keyPath: title])
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(item == selected ? 1 : 0.82))
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(item == selected ? Color.white.opacity(0.22) : Color.white.opacity(0.06))
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white.opacity(0.08))
        )
    }

    private func requestCode() {
        Task { await viewModel.requestCode() }
    }

    private func signInWithPassword() {
        Task {
            await viewModel.signInWithPassword()
            if case .authenticated = viewModel.sessionStore.state {
                onAuthorized()
            }
        }
    }

    private func verify() {
        Task {
            await viewModel.verifyCode()
            if case .authenticated = viewModel.sessionStore.state {
                onAuthorized()
            }
        }
    }

    private func linkTelegram() {
        Task {
            guard let telegramStartURL = await viewModel.requestTelegramPairingLink() else { return }
            openURL(telegramStartURL)
        }
    }

    private func resetBackendConfiguration() {
        container.resetRESTBaseURL()
    }

}

private struct AuthenticationBackdrop: View {
    var body: some View {
        ZStack {
            Color(red: 0.025, green: 0.055, blue: 0.12)

            LinearGradient(
                colors: [
                    Color(red: 0.04, green: 0.12, blue: 0.25),
                    Color(red: 0.025, green: 0.055, blue: 0.12),
                    Color(red: 0.06, green: 0.08, blue: 0.18)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(AppTheme.primary.opacity(0.25))
                .frame(width: 360, height: 360)
                .blur(radius: 55)
                .offset(x: 150, y: -300)

            Circle()
                .fill(AppTheme.aqua.opacity(0.17))
                .frame(width: 280, height: 280)
                .blur(radius: 65)
                .offset(x: -155, y: 240)
        }
        .ignoresSafeArea()
    }
}

private struct AuthenticationCardSurface: View {
    let cornerRadius: CGFloat
    var fill = Color(red: 0.055, green: 0.105, blue: 0.20)

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(fill)
            .overlay(alignment: .top) {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color.white.opacity(0.10), .clear],
                            startPoint: .top,
                            endPoint: .center
                        )
                    )
            }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [Color.white.opacity(0.22), AppTheme.aqua.opacity(0.20), Color.white.opacity(0.07)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .shadow(color: .black.opacity(0.28), radius: 20, y: 10)
    }
}

private struct CompactActionButtonStyleModifier: ViewModifier {
    let prominent: Bool

    func body(content: Content) -> some View {
        if prominent {
            content.buttonStyle(
                LiquidGlassProminentButtonStyle(
                    tint: AppTheme.primary,
                    secondaryTint: AppTheme.coral,
                    height: 54
                )
            )
        } else {
            content.buttonStyle(
                LiquidGlassSecondaryButtonStyle(
                    tint: .white,
                    secondaryTint: AppTheme.aqua,
                    height: 54
                )
            )
        }
    }
}

private struct DemoAccountCard: View {
    let account: AuthDemoAccount
    let isSelected: Bool
    let onSelect: () -> Void
    let onQuickSignIn: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Button(action: onSelect) {
                HStack(spacing: 14) {
                    Circle()
                        .fill(Color(red: 0.13, green: 0.23, blue: 0.37))
                        .frame(width: 54, height: 54)
                        .overlay {
                            Image(systemName: "person.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(Color(red: 0.12, green: 0.54, blue: 0.99))
                        }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(account.displayName)
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text(account.contact)
                            .font(.system(size: 16, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.65))
                        Text("Пароль:  \(account.password)")
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.55))
                    }

                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)

            Button(action: onQuickSignIn) {
                Image(systemName: "arrow.up.left")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .liquidGlassCircle(
                        tint: AppTheme.primary,
                        secondaryTint: AppTheme.aqua,
                        innerDarkness: 0.46
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxHeight: .infinity)
        .padding(16)
        .liquidGlassCard(
            cornerRadius: 24,
            tint: isSelected ? AppTheme.coral : AppTheme.primary,
            secondaryTint: AppTheme.aqua,
            innerDarkness: 0.36
        )
    }
}
