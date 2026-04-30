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
  removeContact(id: string) {
    return httpRequest<{ ok: true }>(`/contacts/${id}`, {
      method: "DELETE",
    });
  },
};
