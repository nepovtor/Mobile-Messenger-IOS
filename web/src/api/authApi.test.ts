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

  it("requestCode posts the Railway-compatible contact payload", async () => {
    await authApi.requestCode("+375291234567");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/request"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          method: "phone",
          contact: "+375291234567",
        }),
      }),
    );
  });

  it("verifyCode posts the Railway-compatible contact payload", async () => {
    await authApi.verifyCode("+375291234567", "123456");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/verify"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          method: "phone",
          contact: "+375291234567",
          code: "123456",
        }),
      }),
    );
  });

  it("requestCode normalizes the legacy Railway response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ expiresIn: 300 }),
      }),
    );

    await expect(authApi.requestCode("+375291234567")).resolves.toEqual({
      status: "code_sent",
      delivery: "telegram",
      resendAfterSeconds: 60,
      expiresIn: 300,
      debugCode: undefined,
    });
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

  it("updateProfile sends the trimmed display name payload", async () => {
    await authApi.updateProfile("Новое имя");

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
