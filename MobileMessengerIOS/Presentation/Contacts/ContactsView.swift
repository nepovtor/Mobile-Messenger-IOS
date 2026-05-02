import SwiftUI

struct ContactsView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var viewModel: ContactsViewModel
    @State private var openedChat: ChatListItem?

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
            .searchable(text: $viewModel.searchQuery, prompt: "Поиск контактов")
            .refreshable { await viewModel.refresh() }
            .navigationDestination(item: $openedChat) { chat in
                DialogueView(chat: chat)
            }
            .overlay(alignment: .top) {
                if let successMessage = viewModel.successMessage {
                    BannerMessageView(
                        message: successMessage,
                        systemImage: "checkmark.circle.fill",
                        tint: .green
                    )
                    .padding()
                } else if let errorMessage = viewModel.errorMessage {
                    BannerMessageView(
                        message: errorMessage,
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        tint: .red
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
        Section {
            addContactSection
        }

        if viewModel.isLoading && viewModel.contacts.isEmpty {
            Section {
                ForEach(0..<5, id: \.self) { _ in
                    ContactRowSkeleton()
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            }
        } else if viewModel.filteredContacts.isEmpty {
            Section {
                ContentUnavailableView(
                    "Контактов пока нет",
                    systemImage: "person.2.slash",
                    description: Text("Добавьте пользователя по номеру телефона, чтобы быстро открыть direct chat.")
                )
            }
        } else {
            Section {
                ForEach(viewModel.filteredContacts) { contact in
                    contactButton(for: contact)
                }
            }
        }
    }

    private var addContactSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Добавить контакт")
                .font(.headline)

            TextField("+375291234567", text: $viewModel.addPhone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            Button {
                Task {
                    await viewModel.addContact()
                }
            } label: {
                HStack {
                    if viewModel.isAdding {
                        ProgressView()
                    }
                    Text("Добавить контакт")
                }
            }
            .disabled(viewModel.isAdding)

            Text("Введите номер в международном формате, например `+375291234567`.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }

    private var backgroundView: some View {
        LinearGradient(
            colors: [Color.blue.opacity(0.12), Color.cyan.opacity(0.06), Color(uiColor: .systemBackground)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
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
