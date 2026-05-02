import Foundation

public struct DefaultContactsRepository: ContactsRepository {
    private let service: ContactsNetworking

    public init(service: ContactsNetworking) {
        self.service = service
    }

    public func listContacts() async throws -> [Contact] {
        try await service.listContacts().map(Contact.init(dto:))
    }

    public func addContact(phone: String) async throws -> Contact {
        Contact(dto: try await service.addContact(phone: phone))
    }

    public func removeContact(id: UUID) async throws {
        try await service.removeContact(id: id)
    }
}
