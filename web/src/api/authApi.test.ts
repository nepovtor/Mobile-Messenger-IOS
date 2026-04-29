import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./authApi";

describe("authApi", () => {
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

  it("requestCode posts the new phone payload", async () => {
    await authApi.requestCode("+375291234567");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/request"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "+375291234567" }),
      }),
    );
  });

  it("verifyCode posts the new phone payload", async () => {
    await authApi.verifyCode("+375291234567", "123456");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/verify"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "+375291234567", code: "123456" }),
      }),
    );
  });

  it("telegram-linked errors keep the backend code in ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            code: "TELEGRAM_NOT_LINKED",
            message:
              "Open the Telegram bot and send your phone number before requesting a code.",
          }),
      }),
    );

    await expect(authApi.requestCode("+375291234567")).rejects.toMatchObject({
      code: "TELEGRAM_NOT_LINKED",
    });
  });
});
