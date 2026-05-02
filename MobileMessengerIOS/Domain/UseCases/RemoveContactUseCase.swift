import Foundation

public struct RemoveContactUseCase {
    private let repository: ContactsRepository

    public init(repository: ContactsRepository) {
        self.repository = repository
    }

    public func callAsFunction(id: UUID) async throws {
        try await repository.removeContact(id: id)
    }
}
