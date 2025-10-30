import SwiftUI

struct AuthView: View {
    @StateObject private var viewModel = AuthViewModel()
    @FocusState private var focusedField: Field?

    enum Field: Hashable {
        case contact
        case code
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("Способ авторизации")) {
                    Picker("Способ", selection: $viewModel.method) {
                        ForEach(AuthMethod.allCases) { method in
                            Label(method.title, systemImage: method.iconName)
                                .tag(method)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: viewModel.method) { _, _ in
                        viewModel.reset()
                        focusedField = .contact
                    }
                }

                Section(header: Text("Контакт"), footer: contactFooter) {
                    TextField(viewModel.method.placeholder, text: $viewModel.contact)
                        .keyboardType(viewModel.method.keyboardType)
                        .textContentType(viewModel.method.textContentType)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .focused($focusedField, equals: .contact)
                        .onSubmit {
                            guard viewModel.isContactValid else { return }
                            Task { await viewModel.requestCode() }
                        }

                    Button {
                        Task { await viewModel.requestCode() }
                    } label: {
                        if viewModel.isRequestingCode {
                            ProgressView()
                        } else {
                            Text(viewModel.isCodeSent ? "Отправить код повторно" : "Получить код")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!viewModel.isContactValid || viewModel.isRequestingCode)
                }

                if viewModel.isCodeSent {
                    Section(header: Text("Код подтверждения")) {
                        TextField("123456", text: $viewModel.code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .focused($focusedField, equals: .code)

                        Button {
                            Task { await viewModel.verifyCode() }
                        } label: {
                            if viewModel.isVerifyingCode {
                                ProgressView()
                            } else {
                                Text("Подтвердить")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .disabled(!viewModel.isCodeValid || viewModel.isVerifyingCode)
                    }
                }

                if let token = viewModel.authToken {
                    Section(header: Text("Результат")) {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Успешная авторизация", systemImage: "checkmark.seal.fill")
                                .foregroundStyle(.green)
                            Text("Токен сессии: \(token)")
                                .font(.footnote)
                                .textSelection(.enabled)
                        }
                    }
                }

                if let error = viewModel.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Вход")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if viewModel.isCodeSent || viewModel.authToken != nil {
                        Button("Сбросить") {
                            viewModel.reset()
                            focusedField = .contact
                        }
                    }
                }

                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Готово") {
                        focusedField = nil
                    }
                }
            }
            .onAppear {
                focusedField = .contact
            }
            .onChange(of: viewModel.isCodeSent) { _, isSent in
                if isSent {
                    focusedField = .code
                }
            }
            .onChange(of: viewModel.authToken) { _, token in
                if token != nil {
                    focusedField = nil
                }
            }
        }
    }

    private var contactFooter: some View {
        VStack(alignment: .leading, spacing: 4) {
            if viewModel.method == .phone {
                Text("Укажите номер телефона в международном формате. На него придёт код подтверждения.")
            } else {
                Text("Мы отправим код подтверждения на указанную почту.")
            }

            if viewModel.isCodeSent {
                if let seconds = viewModel.codeExpirationSeconds, seconds > 0 {
                    Text("Код будет действовать ещё \(seconds) сек.")
                } else {
                    Text("Если код не пришёл, проверьте спам или запросите повторно через минуту.")
                }
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
}

#Preview {
    AuthView()
}
