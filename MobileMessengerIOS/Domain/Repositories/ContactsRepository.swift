import Foundation

public protocol ContactsRepository: Sendable {
    func listContacts() async throws -> [Contact]
    func addContact(phone: String) async throws -> Contact
    func removeContact(id: UUID) async throws
}
