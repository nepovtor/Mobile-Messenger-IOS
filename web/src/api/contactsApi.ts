import type { ContactEntry } from "../types/contact";
import { httpRequest } from "./httpClient";

export const contactsApi = {
  getContacts() {
    return httpRequest<ContactEntry[]>("/contacts");
  },
  addContact(phone: string) {
    return httpRequest<ContactEntry>("/contacts", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  },
  removeContact(identifier: string) {
    return httpRequest<{ ok: true }>(`/contacts/${identifier}`, {
      method: "DELETE",
    });
  },
};
