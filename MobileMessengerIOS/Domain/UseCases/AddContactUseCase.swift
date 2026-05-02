import Foundation

public struct AddContactUseCase {
    private let repository: ContactsRepository

    public init(repository: ContactsRepository) {
        self.repository = repository
    }

    public func callAsFunction(phone: String) async throws -> Contact {
        try await repository.addContact(phone: phone)
    }
}
