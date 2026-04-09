import SwiftUI

@MainActor
struct AuthView: View {
    @StateObject private var viewModel: AuthViewModel
    let onAuthorized: () -> Void

    @State private var selectedTab: AuthTab = .login
    @State private var loginMode: LoginMode = .password
    @AppStorage(AppPreferenceKeys.language) private var languagePreference = AppLanguagePreference.system.rawValue
    @FocusState private var focusedField: Field?

    enum AuthTab: CaseIterable {
        case login
        case register
    }

    enum LoginMode: CaseIterable {
        case password
        case code
    }

    private enum Field: Hashable {
        case name
        case phone
        case password
        case code
    }

    @MainActor
    init(container: AppContainer? = nil, onAuthorized: @escaping () -> Void) {
        let container = container ?? .shared
        _viewModel = StateObject(wrappedValue: container.makeAuthViewModel())
        self.onAuthorized = onAuthorized
    }

    var body: some View {
        ZStack {
            backgroundView

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    heroSection
                    formCard
                    helperFootnote
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            viewModel.method = .phone
            focusedField = selectedTab == .register ? .name : .phone
        }
        .onChange(of: selectedTab) {
            viewModel.method = .phone
            viewModel.resetVerificationState()
            focusedField = selectedTab == .register ? .name : .phone
        }
        .onChange(of: loginMode) {
            viewModel.resetVerificationState()
            viewModel.errorMessage = nil
            focusedField = .phone
        }
        .onChange(of: viewModel.state) {
            if case .authenticated = viewModel.state {
                onAuthorized()
            }
        }
    }

    private var backgroundView: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.04, green: 0.34, blue: 0.98),
                    Color(red: 0.19, green: 0.51, blue: 0.95),
                    Color(red: 0.35, green: 0.34, blue: 0.84)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.white.opacity(0.16))
                .frame(width: 280, height: 280)
                .blur(radius: 18)
                .offset(x: 150, y: -260)

            Circle()
                .fill(Color.white.opacity(0.10))
                .frame(width: 260, height: 260)
                .blur(radius: 12)
                .offset(x: -140, y: 260)
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.18))
                .frame(width: 72, height: 72)
                .overlay(
                    Image(systemName: "message.badge.waveform.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 8) {
                Text("Mobile Messenger")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text(selectedTab == .login
                     ? t("Быстрый вход в защищённые чаты и синхронизация без лишних шагов.", "Fast access to secure chats and sync without extra friction.")
                     : t("Создайте профиль за минуту и начните общение с красивого приветственного экрана.", "Create your profile in a minute and start chatting from a polished welcome screen."))
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var formCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            Picker(t("Режим", "Mode"), selection: $selectedTab) {
                ForEach(AuthTab.allCases, id: \.self) { tab in
                    Text(title(for: tab)).tag(tab)
                }
            }
            .pickerStyle(.segmented)

            if selectedTab == .login {
                Picker(t("Способ входа", "Sign in method"), selection: $loginMode) {
                    ForEach(LoginMode.allCases, id: \.self) { mode in
                        Text(title(for: mode)).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }

            if selectedTab == .register {
                inputField(
                    title: t("Имя", "Name"),
                    icon: "person.text.rectangle",
                    message: viewModel.displayName.isEmpty
                        ? t("Минимум 2 символа", "At least 2 characters")
                        : (viewModel.isDisplayNameValid ? t("Имя выглядит отлично", "Name looks great") : t("Имя пока слишком короткое", "The name is still too short")),
                    color: validationColor(isEmpty: viewModel.displayName.isEmpty, isValid: viewModel.isDisplayNameValid)
                ) {
                    TextField(t("Например, Анна", "For example, Anna"), text: $viewModel.displayName)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .textContentType(.name)
                        .focused($focusedField, equals: .name)
                }
            }

            inputField(
                title: t("Номер телефона", "Phone number"),
                icon: "iphone.gen3",
                message: viewModel.contact.isEmpty
                    ? t("Формат: +79990000000", "Format: +15551234567")
                    : (viewModel.isContactValid ? t("Номер выглядит корректно", "Phone number looks correct") : t("Нужно минимум 10 цифр", "At least 10 digits are required")),
                color: validationColor(isEmpty: viewModel.contact.isEmpty, isValid: viewModel.isContactValid)
            ) {
                TextField("+7 (999) 000-00-00", text: $viewModel.contact)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focusedField, equals: .phone)
            }

            if selectedTab == .login && loginMode == .password {
                inputField(
                    title: t("Пароль", "Password"),
                    icon: "lock.fill",
                    message: viewModel.password.isEmpty
                        ? t("Для demo аккаунтов используйте пароль из списка ниже", "For demo accounts, use a password from the list below")
                        : (viewModel.isPasswordValid ? t("Пароль готов к входу", "Password looks good") : t("Нужно минимум 4 символа", "At least 4 characters are required")),
                    color: validationColor(isEmpty: viewModel.password.isEmpty, isValid: viewModel.isPasswordValid)
                ) {
                    SecureField(t("Введите пароль", "Enter password"), text: $viewModel.password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                }
            }

            if loginMode == .code && viewModel.isCodeSent {
                inputField(
                    title: t("Код подтверждения", "Verification code"),
                    icon: "number.square",
                    message: codeDescription,
                    color: validationColor(isEmpty: viewModel.code.isEmpty, isValid: viewModel.isCodeValid)
                ) {
                    TextField(t("Введите код", "Enter the code"), text: $viewModel.code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .focused($focusedField, equals: .code)
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            if let error = viewModel.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color.orange)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }

            Button(action: handlePrimaryAction) {
                HStack(spacing: 12) {
                    if viewModel.isRequestingCode || viewModel.isVerifyingCode {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: viewModel.isCodeSent ? "checkmark.seal.fill" : "paperplane.fill")
                    }

                    Text(primaryButtonTitle)
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(
                    LinearGradient(
                        colors: primaryButtonDisabled
                            ? [Color.gray.opacity(0.75), Color.gray.opacity(0.6)]
                            : [Color(red: 0.00, green: 0.48, blue: 1.00), Color(red: 0.35, green: 0.34, blue: 0.84)],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous)
                )
                .shadow(color: primaryButtonDisabled ? .clear : Color.blue.opacity(0.24), radius: 16, y: 10)
            }
            .buttonStyle(.plain)
            .disabled(primaryButtonDisabled || viewModel.isRequestingCode || viewModel.isVerifyingCode)

            if selectedTab == .login && loginMode == .password {
                demoAccountsCard
            }
        }
        .padding(24)
        .background(Color(uiColor: .systemBackground).opacity(0.92), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.28), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.16), radius: 24, y: 16)
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: viewModel.isCodeSent)
    }

    private var helperFootnote: some View {
        Text(helperFootnoteText)
            .font(.footnote)
            .foregroundStyle(Color.white.opacity(0.86))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var primaryButtonTitle: String {
        if selectedTab == .login && loginMode == .password {
            return t("Войти по паролю", "Sign in with password")
        }
        if viewModel.isCodeSent {
            return selectedTab == .register ? t("Создать профиль", "Create profile") : t("Подтвердить вход", "Confirm sign in")
        }
        return t("Получить код", "Get code")
    }

    private var primaryButtonDisabled: Bool {
        if selectedTab == .login && loginMode == .password {
            return !viewModel.isContactValid || !viewModel.isPasswordValid
        }

        if viewModel.isCodeSent {
            return !viewModel.isCodeValid || (selectedTab == .register && !viewModel.isDisplayNameValid)
        }

        if selectedTab == .register {
            return !viewModel.isDisplayNameValid || !viewModel.isContactValid
        }

        return !viewModel.isContactValid
    }

    private var helperFootnoteText: String {
        if selectedTab == .login && loginMode == .password {
            return t("Ниже есть 5 demo-аккаунтов с телефоном и паролем. Можно открыть два симулятора, войти разными пользователями и сразу переписываться.", "Below are 5 demo accounts with phone numbers and passwords. Open two simulators, sign in with different users and start chatting right away.")
        }

        return t("Для локального backend код по умолчанию `123456`, если в `server/.env` не указан свой `AUTH_TEST_CODE`.", "For the local backend, the default code is `123456` unless `AUTH_TEST_CODE` is set in `server/.env`.")
    }

    private var codeDescription: String {
        if viewModel.code.isEmpty, let expiration = viewModel.codeExpirationSeconds {
            return t("Код активен ещё \(expiration) сек.", "Code is active for \(expiration) sec.")
        }

        if viewModel.code.isEmpty {
            return t("Введите код из SMS или локального `.env`.", "Enter the code from SMS or from local `.env`.")
        }

        return viewModel.isCodeValid ? t("Код готов к проверке", "Code is ready to verify") : t("Нужно минимум 4 символа", "At least 4 characters are required")
    }

    private func validationColor(isEmpty: Bool, isValid: Bool) -> Color {
        if isEmpty {
            return .secondary
        }
        return isValid ? .green : .orange
    }

    private func handlePrimaryAction() {
        Task {
            if selectedTab == .login && loginMode == .password {
                await viewModel.signInWithPassword()
            } else if viewModel.isCodeSent {
                await viewModel.verifyCode(displayName: selectedTab == .register ? viewModel.displayName : nil)
            } else {
                await viewModel.requestCode()
                if viewModel.isCodeSent {
                    focusedField = .code
                }
            }
        }
    }

    private func title(for tab: AuthTab) -> String {
        switch tab {
        case .login:
            return t("Вход", "Sign In")
        case .register:
            return t("Регистрация", "Sign Up")
        }
    }

    private func title(for mode: LoginMode) -> String {
        switch mode {
        case .password:
            return t("Пароль", "Password")
        case .code:
            return t("Код", "Code")
        }
    }

    private func t(_ ru: String, _ en: String) -> String {
        language.text(ru: ru, en: en)
    }

    private var language: AppLanguagePreference {
        AppLanguagePreference(rawValue: languagePreference) ?? .system
    }

    @ViewBuilder
    private func inputField<Content: View>(
        title: String,
        icon: String,
        message: String,
        color: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.primary)

            content()
                .font(.system(size: 17, weight: .medium))
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color.black.opacity(0.04), lineWidth: 1)
                )

            Text(message)
                .font(.footnote)
                .foregroundStyle(color)
        }
    }

    private var demoAccountsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("Demo аккаунты", "Demo accounts"))
                .font(.headline)

            ForEach(AuthViewModel.demoAccounts) { account in
                Button {
                    viewModel.applyDemoAccount(account)
                    focusedField = .password
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Circle()
                            .fill(Color.blue.opacity(0.12))
                            .frame(width: 40, height: 40)
                            .overlay(
                                Image(systemName: "person.fill")
                                    .foregroundStyle(.blue)
                            )

                        VStack(alignment: .leading, spacing: 4) {
                            Text(account.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)

                            Text(account.phone)
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Text("\(t("Пароль", "Password")): \(account.password)")
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }

                        Spacer(minLength: 12)

                        Image(systemName: "arrow.down.left.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.blue)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
