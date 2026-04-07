import SwiftUI

@MainActor
struct AuthView: View {
    @StateObject private var viewModel: AuthViewModel
    let onAuthorized: () -> Void

    @State private var selectedTab: AuthTab = .login

    enum AuthTab: String, CaseIterable {
        case login = "Вход"
        case register = "Регистрация"
    }

    @MainActor
    init(container: AppContainer? = nil, onAuthorized: @escaping () -> Void) {
        let container = container ?? .shared
        _viewModel = StateObject(wrappedValue: container.makeAuthViewModel())
        self.onAuthorized = onAuthorized
    }

    var body: some View {
        VStack(spacing: 24) {
            Text("Mobile Messenger")
                .font(.largeTitle)
                .fontWeight(.bold)

            Picker("Режим", selection: $selectedTab) {
                ForEach(AuthTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)

            VStack(alignment: .leading, spacing: 8) {
                Text("Номер телефона")
                    .font(.headline)
                TextField("+7 (999) 000-00-00", text: $viewModel.contact)
                    .padding()
                    .background(Color.gray.opacity(0.2))
                    .cornerRadius(8)
                    .keyboardType(.phonePad)
            }

            if viewModel.isCodeSent {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Код подтверждения")
                        .font(.headline)
                    TextField("Введите код", text: $viewModel.code)
                        .padding()
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(8)
                        .keyboardType(.numberPad)
                }

                if let expiration = viewModel.codeExpirationSeconds {
                    Text("Код действителен \(expiration) сек")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.footnote)
            }

            Button(action: {
                Task {
                    if viewModel.isCodeSent {
                        await viewModel.verifyCode()
                    } else {
                        await viewModel.requestCode()
                    }
                }
            }) {
                Text(viewModel.isCodeSent ? "Подтвердить" : (selectedTab == .login ? "Войти" : "Зарегистрироваться"))
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(viewModel.isCodeSent ? (viewModel.isCodeValid ? Color.blue : Color.gray) : (viewModel.isContactValid ? Color.blue : Color.gray))
                    .cornerRadius(8)
            }
            .disabled(viewModel.isCodeSent ? !viewModel.isCodeValid : !viewModel.isContactValid)
            .disabled(viewModel.isRequestingCode || viewModel.isVerifyingCode)

            if viewModel.isRequestingCode || viewModel.isVerifyingCode {
                ProgressView()
            }

            Spacer()
        }
        .padding()
        .onChange(of: viewModel.state) {
            if case .authenticated = viewModel.state {
                onAuthorized()
            }
        }
    }
}
