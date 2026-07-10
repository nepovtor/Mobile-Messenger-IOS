import type { ContactEntry } from "@/features/contacts/types/contact";
import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";

export const contactsApi = {
  getContacts() {
    return httpRequest<ContactEntry[]>(apiPath("listContacts"));
  },
  addContact(phone: string) {
    return httpRequest<ContactEntry>(apiPath("createContact"), {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  },
  removeContact(identifier: string) {
    return httpRequest<{ ok: true }>(apiPath("deleteContact", { identifier }), {
      method: "DELETE",
    });
  },
};
