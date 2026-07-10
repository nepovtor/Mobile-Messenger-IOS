import { beforeEach, describe, expect, it, vi } from "vitest";
import { contactsApi } from "@/features/contacts/api/contactsApi";

describe("contactsApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "[]",
      }),
    );
  });

  it("addContact posts the phone payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: "contact-1",
            userID: "user-2",
            displayName: "Boris",
            phone: "+15550002",
            createdAt: "2026-05-01T00:00:00.000Z",
            directChatID: null,
          }),
      }),
    );

    await contactsApi.addContact("+15550002");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/contacts"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "+15550002" }),
      }),
    );
  });
});
