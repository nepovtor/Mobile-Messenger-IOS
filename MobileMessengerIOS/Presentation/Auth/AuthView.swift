import SwiftUI
import Combine

struct AuthView: View {
    @StateObject private var viewModel: AuthViewModel
    @ObservedObject private var container: AppContainer
    @Environment(\.openURL) private var openURL
    let onAuthorized: () -> Void

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
        .onReceive(viewModel.sessionStore.$state) { state in
            if case .authenticated = state {
                onAuthorized()
            }
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AppTheme.primary, AppTheme.aqua],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 78, height: 78)
                .overlay {
                    Image(systemName: "message.fill")
                        .font(.system(size: 31, weight: .bold))
                        .foregroundStyle(.white)
                }
                .shadow(color: AppTheme.primary.opacity(0.40), radius: 18, y: 8)

            VStack(alignment: .leading, spacing: 7) {
                Text("Mobile Messenger")
                    .font(.system(size: 33, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Text("Безопасные чаты, контакты и геолокация в одном приложении.")
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.76))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var authCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            contactField
            codeSection

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color(red: 1.0, green: 0.55, blue: 0.55))
                    .fixedSize(horizontal: false, vertical: true)
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

    private var contactField: some View {
        VStack(alignment: .leading, spacing: 12) {
            fieldLabel("Номер телефона", systemImage: "iphone")
            TextField("+7 (999) 000-00-00", text: $viewModel.contact)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 18, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 58)
                .background(fieldBackground)

            Text("Введите номер в международном формате, например +375291234567")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.55))
        }
    }

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            fieldLabel("Пароль", systemImage: "lock.fill")
            SecureField("Введите пароль", text: $viewModel.password)
                .textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 20, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 58)
                .background(fieldBackground)

            Text("Для демо-аккаунтов используйте пароль из списка ниже")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.55))

            primaryButton(
                title: "Войти с паролем",
                systemImage: "paperplane.fill",
                isLoading: viewModel.isSigningInWithPassword,
                isEnabled: viewModel.isContactValid && viewModel.isPasswordValid && !viewModel.isSigningInWithPassword,
                action: signInWithPassword
            )
        }
    }

    private var codeSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            fieldLabel("Подтверждение в Telegram", systemImage: "paperplane.fill")
            telegramInstructionCard
            if viewModel.isCodeSent {
                TextField("Введите код", text: $viewModel.code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(size: 20, weight: .medium, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 58)
                    .background(fieldBackground)
            }

            if let seconds = viewModel.codeExpirationSeconds {
                Text("Код действует ещё \(seconds) сек.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
            } else if let pairingHint = viewModel.telegramPairingHintText {
                Text(pairingHint)
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Введите реальный номер в международном формате, чтобы получить одноразовый код в Telegram.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }

            primaryButton(
                title: viewModel.isCodeSent ? "Отправить код повторно" : "Получить код",
                systemImage: "paperplane.fill",
                isLoading: viewModel.isRequestingCode,
                isEnabled: viewModel.isContactValid && !viewModel.isRequestingCode,
                action: requestCode
            )

            if viewModel.isCodeSent {
                primaryButton(
                    title: "Подтвердить и продолжить",
                    systemImage: "checkmark.circle.fill",
                    isLoading: viewModel.isVerifyingCode,
                    isEnabled: viewModel.isCodeValid && !viewModel.isVerifyingCode,
                    action: verify
                )
            }
        }
    }

    private var telegramInstructionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(viewModel.telegramInstructionText)
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)

            Button(action: linkTelegram) {
                HStack(spacing: 10) {
                    if viewModel.isLinkingTelegram {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "link.circle.fill")
                    }
                    Text("Привязать Telegram")
                }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                .frame(height: 50)
            }
            .buttonStyle(
                LiquidGlassProminentButtonStyle(
                    tint: AppTheme.primary,
                    secondaryTint: AppTheme.aqua,
                    height: 50
                )
            )
            .disabled(!viewModel.isContactValid || viewModel.isLinkingTelegram)

            if !viewModel.isContactValid {
                Text("Сначала введите номер выше, чтобы приложение создало защищённую ссылку для бота.")
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.55))
            }
        }
        .padding(15)
        .background(AuthenticationCardSurface(cornerRadius: 20, fill: Color(red: 0.08, green: 0.16, blue: 0.29)))
    }

    private var demoAccountsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("Демо-аккаунты")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Spacer(minLength: 0)

                Text("Листайте вбок")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.45))
            }

            if let lastUsedLogin = viewModel.lastUsedLogin {
                lastUsedLoginSection(lastUsedLogin)
            }

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
                        .frame(width: 312)
                    }
                }
            }

            Text("Последний выбранный вход запоминается на этом устройстве.")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.55))
        }
    }

    private func lastUsedLoginSection(_ lastUsedLogin: AuthLastUsedLogin) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Последний вход")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text(lastUsedLogin.title)
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)

            Text(lastUsedLogin.subtitle)
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.62))
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 10) {
                compactActionButton(
                    title: "Заполнить",
                    systemImage: "arrow.clockwise",
                    prominent: false
                ) {
                    viewModel.applyLastUsedLogin()
                }

                if lastUsedLogin.demoAccount != nil {
                    compactActionButton(
                        title: "Войти сразу",
                        systemImage: "person.crop.circle.badge.checkmark",
                        prominent: true
                    ) {
                        Task { await viewModel.signInLastUsedDemoAccount() }
                    }
                }
            }
        }
        .padding(16)
        .liquidGlassCard(
            cornerRadius: 22,
            tint: AppTheme.coral,
            secondaryTint: AppTheme.primary,
            innerDarkness: 0.34
        )
    }

    private var shouldShowBackendSupport: Bool {
        container.isUsingCustomRESTBaseURL
    }

    private var backendSupportSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Кастомный backend активен только на этом устройстве.")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text("Если авторизация или Telegram pairing работают нестабильно, можно сразу сбросить override и вернуться на встроенный production backend. Адрес API и токены здесь не показываются.")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)

            compactActionButton(
                title: "Сбросить backend",
                systemImage: "arrow.counterclockwise",
                prominent: false,
                action: resetBackendConfiguration
            )
        }
        .padding(16)
        .liquidGlassCard(
            cornerRadius: 22,
            tint: AppTheme.primary,
            secondaryTint: AppTheme.aqua,
            innerDarkness: 0.34
        )
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
