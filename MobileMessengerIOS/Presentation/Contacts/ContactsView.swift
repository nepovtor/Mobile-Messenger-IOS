import SwiftUI

struct ContactsView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var viewModel: ContactsViewModel
    @State private var openedChat: ChatListItem?
    @State private var isShowingAddContact = false

    @MainActor
    init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: container.makeContactsViewModel())
    }

    var body: some View {
        NavigationStack {
            List { contentSections }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(backgroundView)
            .navigationTitle("Контакты")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $viewModel.searchQuery, prompt: "Поиск контактов")
            .refreshable { await viewModel.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingAddContact = true
                    } label: {
                        Label("Добавить контакт", systemImage: "person.badge.plus")
                    }
                }
            }
            .sheet(isPresented: $isShowingAddContact) {
                AddContactSheet(
                    isPresented: $isShowingAddContact,
                    viewModel: viewModel
                )
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
            .navigationDestination(item: $openedChat) { chat in
                DialogueView(chat: chat)
            }
            .overlay(alignment: .top) {
                if let successMessage = viewModel.successMessage {
                        BannerMessageView(
                            message: successMessage,
                            systemImage: "checkmark.circle.fill",
                            tint: AppTheme.mint
                        )
                    .padding()
                } else if let errorMessage = viewModel.errorMessage {
                        BannerMessageView(
                            message: errorMessage,
                            systemImage: "person.crop.circle.badge.exclamationmark",
                            tint: AppTheme.coral
                        )
                    .padding()
                }
            }
            .task {
                viewModel.handleSessionChange(sessionStore.state)
                viewModel.onAppear()
            }
            .onChange(of: sessionStore.state) { _, newState in
                viewModel.handleSessionChange(newState)
                viewModel.onAppear()
            }
        }
    }

    @ViewBuilder
    private var contentSections: some View {
        if viewModel.isLoading && viewModel.contacts.isEmpty {
            Section {
                ForEach(0..<5, id: \.self) { _ in
                    ContactRowSkeleton()
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            }
        } else if viewModel.filteredContacts.isEmpty {
            Section {
                ContentUnavailableView(
                    "Контактов пока нет",
                    systemImage: "person.2.slash",
                    description: Text("Нажмите кнопку добавления сверху и введите номер телефона.")
                )
                .listRowBackground(Color.clear)
            }
        } else {
            Section {
                ForEach(viewModel.filteredContacts) { contact in
                    contactButton(for: contact)
                }
            } header: {
                Text(contactsSectionTitle)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(nil)
            }
        }
    }

    private var contactsSectionTitle: String {
        if viewModel.searchQuery.isEmpty {
            return "Все контакты · \(viewModel.filteredContacts.count)"
        }
        return "Результаты поиска · \(viewModel.filteredContacts.count)"
    }

    private var backgroundView: some View {
        Color(uiColor: .systemGroupedBackground)
            .ignoresSafeArea()
    }

    private func contactButton(for contact: Contact) -> some View {
        Button {
            Task {
                if let chat = await viewModel.openChat(with: contact) {
                    openedChat = chat
                }
            }
        } label: {
            ContactRow(
                contact: contact,
                isOpening: viewModel.openingContactID == contact.userID
            )
            .equatable()
        }
        .buttonStyle(.plain)
        .disabled(viewModel.openingContactID == contact.userID)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                Task {
                    await viewModel.removeContact(contact)
                }
            } label: {
                if viewModel.removingContactID == contact.id {
                    ProgressView()
                } else {
                    Label("Удалить", systemImage: "trash")
                }
            }
        }
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(Color.clear)
    }
}

private struct AddContactSheet: View {
    @Binding var isPresented: Bool
    @ObservedObject var viewModel: ContactsViewModel

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Номер телефона")
                        .font(.headline)

                    Text("Найдём пользователя и добавим его в список контактов.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                TextField("+375 29 123-45-67", text: $viewModel.addPhone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.body.weight(.medium))
                    .padding(.horizontal, 16)
                    .frame(height: 56)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(Color(uiColor: .separator).opacity(0.22), lineWidth: 1)
                    }

                if let validationMessage = viewModel.addContactValidationMessage,
                   !viewModel.addPhone.isEmpty {
                    Label(validationMessage, systemImage: "exclamationmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                } else {
                    Text("Используйте международный формат, начиная с «+».")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Button {
                    Task {
                        await viewModel.addContact()
                        if viewModel.errorMessage == nil {
                            isPresented = false
                        }
                    }
                } label: {
                    HStack(spacing: 10) {
                        if viewModel.isAdding {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "person.badge.plus")
                        }
                        Text("Добавить контакт")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(
                    LiquidGlassProminentButtonStyle(
                        tint: AppTheme.primary,
                        secondaryTint: AppTheme.aqua,
                        height: 56
                    )
                )
                .disabled(viewModel.isAdding || viewModel.addContactValidationMessage != nil)

                Spacer(minLength: 0)
            }
            .padding(20)
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Новый контакт")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        isPresented = false
                    }
                }
            }
            .interactiveDismissDisabled(viewModel.isAdding)
        }
    }
}
