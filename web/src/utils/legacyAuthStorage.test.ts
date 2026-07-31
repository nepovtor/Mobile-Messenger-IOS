import { describe, expect, it, vi } from "vitest";
import { purgeLegacyAuthStorage } from "@/utils/legacyAuthStorage";

describe("purgeLegacyAuthStorage", () => {
  it("idempotently removes every legacy bearer and profile key", () => {
    const removeItem = vi.fn();
    const storage = { removeItem };

    purgeLegacyAuthStorage(storage);
    purgeLegacyAuthStorage(storage);

    expect(removeItem.mock.calls.slice(0, 4).map(([key]) => key)).toEqual([
      "mobile-messenger.web.token",
      "mobile-messenger.web.user",
      "mobile-messenger.web.admin.token",
      "mobile-messenger.web.admin.user",
    ]);
    expect(removeItem).toHaveBeenCalledTimes(8);
  });
});
