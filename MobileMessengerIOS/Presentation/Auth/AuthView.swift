import SwiftUI
import Combine

struct AuthView: View {
    @StateObject private var viewModel: AuthViewModel
    private let container: AppContainer
    @State private var serverURLDraft: String
    let onAuthorized: () -> Void

    @MainActor
    init(onAuthorized: @escaping () -> Void) {
        self.init(container: .shared, onAuthorized: onAuthorized)
    }

    @MainActor
    init(container: AppContainer, onAuthorized: @escaping () -> Void) {
        _viewModel = StateObject(wrappedValue: container.makeAuthViewModel())
        _serverURLDraft = State(initialValue: container.restBaseURLString)
        self.container = container
        self.onAuthorized = onAuthorized
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.10, green: 0.33, blue: 0.95),
                    Color(red: 0.45, green: 0.66, blue: 0.98)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    heroSection
                    authCard
                    backendCard
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 36)
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
        VStack(alignment: .leading, spacing: 20) {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white.opacity(0.12))
                .frame(width: 126, height: 126)
                .overlay {
                    Image(systemName: "message.fill")
                        .font(.system(size: 50, weight: .semibold))
                        .foregroundStyle(.white)
                }

            VStack(alignment: .leading, spacing: 10) {
                Text("Mobile Messenger")
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                Text("Fast access to secure chats and sync without extra friction.")
                    .font(.system(size: 21, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var authCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            segment(
                items: AuthScreenMode.allCases,
                selected: viewModel.screenMode,
                title: \.title
            ) { mode in
                viewModel.setScreenMode(mode)
            }

            if viewModel.screenMode == .signIn {
                segment(
                    items: AuthCredentialMode.allCases,
                    selected: viewModel.credentialMode,
                    title: \.title
                ) { mode in
                    viewModel.setCredentialMode(mode)
                }
            }

            contactField

            if viewModel.isPasswordFlow {
                passwordSection
            } else {
                codeSection
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color(red: 1.0, green: 0.55, blue: 0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if viewModel.isPasswordFlow {
                demoAccountsSection
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(Color(red: 0.01, green: 0.03, blue: 0.08).opacity(0.96))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.28), radius: 28, x: 0, y: 18)
    }

    private var backendCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "network")
                    .font(.system(size: 20, weight: .semibold))
                Text("Backend")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
            }
            .foregroundStyle(.white)

            Text("Simulator can use 127.0.0.1. A real iPhone must use your Mac Wi-Fi IP, and `/api` will be added automatically if needed.")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            TextField("http://127.0.0.1:8080/api", text: $serverURLDraft)
                .keyboardType(.URL)
                .textContentType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 17, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 64)
                .background(fieldBackground)

            VStack(alignment: .leading, spacing: 8) {
                statusLine(
                    title: "Current",
                    value: container.restBaseURLString
                )
                statusLine(
                    title: "Default",
                    value: container.defaultRESTBaseURLString
                )
            }

            HStack(spacing: 12) {
                compactActionButton(
                    title: "Apply URL",
                    systemImage: "checkmark.circle.fill",
                    prominent: true,
                    action: applyServerURL
                )

                compactActionButton(
                    title: container.isUsingCustomRESTBaseURL ? "Use Default" : "Use Localhost",
                    systemImage: "arrow.counterclockwise",
                    prominent: false,
                    action: resetServerURL
                )
            }

            Text(container.isUsingCustomRESTBaseURL ? "Custom debug backend is active. The app resets the current session after switching servers." : "Default local debug backend is active.")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Color.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(Color(red: 0.01, green: 0.03, blue: 0.08).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 12)
    }

    private var contactField: some View {
        VStack(alignment: .leading, spacing: 12) {
            fieldLabel("Phone number", systemImage: "iphone")
            TextField("+7 (999) 000-00-00", text: $viewModel.contact)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 20, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 76)
                .background(fieldBackground)

            Text("Format: +15551234567")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.55))
        }
    }

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            fieldLabel("Password", systemImage: "lock.fill")
            SecureField("Enter password", text: $viewModel.password)
                .textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 20, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 76)
                .background(fieldBackground)

            Text("For demo accounts, use a password from the list below")
                .font(.footnote)
                .foregroundStyle(Color.white.opacity(0.55))

            primaryButton(
                title: "Sign in with password",
                systemImage: "paperplane.fill",
                isLoading: viewModel.isSigningInWithPassword,
                isEnabled: viewModel.isContactValid && viewModel.isPasswordValid && !viewModel.isSigningInWithPassword,
                action: signInWithPassword
            )
        }
    }

    private var codeSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            if viewModel.isCodeSent {
                fieldLabel("Code", systemImage: "number.square.fill")
                TextField("Enter code", text: $viewModel.code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(size: 20, weight: .medium, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 76)
                    .background(fieldBackground)
            }

            if let seconds = viewModel.codeExpirationSeconds {
                Text("Code expires in \(seconds) seconds")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
            } else {
                Text(viewModel.screenMode == .signUp ? "Create an account with a one-time code." : "Use a one-time code if you prefer not to use a demo password.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }

            primaryButton(
                title: viewModel.isCodeSent ? "Send code again" : "Get code",
                systemImage: "paperplane.fill",
                isLoading: viewModel.isRequestingCode,
                isEnabled: viewModel.isContactValid && !viewModel.isRequestingCode,
                action: requestCode
            )

            if viewModel.isCodeSent {
                primaryButton(
                    title: viewModel.screenMode == .signUp ? "Create account" : "Sign in with code",
                    systemImage: "checkmark.circle.fill",
                    isLoading: viewModel.isVerifyingCode,
                    isEnabled: viewModel.isCodeValid && !viewModel.isVerifyingCode,
                    action: verify
                )
            }
        }
    }

    private var demoAccountsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Demo accounts")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            ForEach(viewModel.demoAccounts) { account in
                DemoAccountCard(
                    account: account,
                    isSelected: account.contact == viewModel.contact
                ) {
                    viewModel.selectDemoAccount(account)
                } onQuickSignIn: {
                    Task { await viewModel.signInDemoAccount(account) }
                }
            }
        }
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(Color.white.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
    }

    private func fieldLabel(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
            Text(title)
                .font(.system(size: 21, weight: .bold, design: .rounded))
        }
        .foregroundStyle(.white)
    }

    private func statusLine(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.white.opacity(0.45))

            Text(value)
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundStyle(.white.opacity(0.92))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
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
            .foregroundStyle(.white.opacity(isEnabled ? 1 : 0.55))
            .frame(maxWidth: .infinity)
            .frame(height: 70)
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(Color.white.opacity(isEnabled ? 0.18 : 0.08))
            )
        }
        .buttonStyle(.plain)
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
            .foregroundStyle(.white.opacity(prominent ? 1 : 0.82))
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(prominent ? Color.white.opacity(0.18) : Color.white.opacity(0.08))
            )
        }
        .buttonStyle(.plain)
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

    private func applyServerURL() {
        do {
            try container.updateRESTBaseURL(serverURLDraft)
        } catch {
            viewModel.errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func resetServerURL() {
        container.resetRESTBaseURL()
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
                        Text("Code: \(account.code)")
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
                    .foregroundStyle(.black)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Color(red: 0.13, green: 0.54, blue: 0.99)))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(isSelected ? Color.white.opacity(0.12) : Color.white.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(isSelected ? Color.white.opacity(0.18) : Color.white.opacity(0.04), lineWidth: 1)
        )
    }
}
