import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileApi } from "./profileApi";

describe("profileApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "{}",
      }),
    );
  });

  it("sends the display name patch payload", async () => {
    await profileApi.updateProfile("Новое имя");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/me/profile"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          displayName: "Новое имя",
        }),
      }),
    );
  });
});
