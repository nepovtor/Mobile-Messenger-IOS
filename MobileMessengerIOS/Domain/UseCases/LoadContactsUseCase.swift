import Foundation

public struct LoadContactsUseCase {
    private let repository: ContactsRepository

    public init(repository: ContactsRepository) {
        self.repository = repository
    }

    public func callAsFunction() async throws -> [Contact] {
        try await repository.listContacts()
    }
}
