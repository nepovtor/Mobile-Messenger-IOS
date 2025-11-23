import SwiftUI
import Combine

struct AuthView: View {
    @StateObject private var viewModel: AuthViewModel
    let onAuthorized: () -> Void

    init(container: AppContainer = .shared, onAuthorized: @escaping () -> Void) {
        _viewModel = StateObject(wrappedValue: container.makeAuthViewModel())
        self.onAuthorized = onAuthorized
    }

    var body: some View {
        VStack(spacing: 24) {
            Picker("Способ", selection: $viewModel.method) {
                Text("Телефон").tag(AuthMethod.phone)
                Text("Email").tag(AuthMethod.email)
            }
            .pickerStyle(.segmented)

            TextField(viewModel.method == .phone ? "+7 999 000-00-00" : "name@example.com", text: $viewModel.contact)
                .keyboardType(viewModel.method == .phone ? .phonePad : .emailAddress)
                .textContentType(viewModel.method == .phone ? .telephoneNumber : .emailAddress)
                .padding()
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(uiColor: .secondarySystemBackground)))

            if viewModel.isCodeSent {
                VStack(spacing: 12) {
                    SecureField("Код", text: $viewModel.code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .padding()
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color(uiColor: .secondarySystemBackground)))

                    if let seconds = viewModel.codeExpirationSeconds {
                        Text("Код истечет через \(seconds) сек.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Button(action: verify) {
                        if viewModel.isVerifyingCode {
                            ProgressView()
                                .progressViewStyle(.circular)
                        } else {
                            Text("Войти")
                                .bold()
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!viewModel.isCodeValid || viewModel.isVerifyingCode)
                }
                .transition(.move(edge: .bottom))
            }

            Button(action: requestCode) {
                if viewModel.isRequestingCode {
                    ProgressView()
                        .progressViewStyle(.circular)
                } else {
                    Text(viewModel.isCodeSent ? "Отправить код снова" : "Получить код")
                        .bold()
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!viewModel.isContactValid || viewModel.isRequestingCode)

            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.top, 16)
            }

            Spacer()
        }
        .padding()
        .animation(.easeInOut, value: viewModel.isCodeSent)
        .onReceive(viewModel.sessionStore.$state) { state in
            if case .authenticated = state {
                onAuthorized()
            }
        }
    }

    private func requestCode() {
        Task { await viewModel.requestCode() }
    }

    private func verify() {
        Task {
            await viewModel.verifyCode()
            if case .authenticated = viewModel.sessionStore.state {
                onAuthorized()
            }
        }
    }
}
