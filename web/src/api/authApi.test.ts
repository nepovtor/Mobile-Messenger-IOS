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

  it("requestTelegramPairing posts the phone payload and returns the secure start URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            botUsername: "mobile_auth_bot",
            telegramStartUrl:
              "https://t.me/mobile_auth_bot?start=secure-pair-token",
            expiresIn: 600,
          }),
      }),
    );

    await expect(
      authApi.requestTelegramPairing("+375291234567"),
    ).resolves.toEqual({
      botUsername: "mobile_auth_bot",
      telegramStartUrl: "https://t.me/mobile_auth_bot?start=secure-pair-token",
      expiresIn: 600,
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/telegram/pairing"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          phone: "+375291234567",
        }),
      }),
    );
  });

  it("requestCode posts the phone payload", async () => {
    await authApi.requestCode("+375291234567");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/request"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          phone: "+375291234567",
        }),
      }),
    );
  });

  it("verifyCode posts the phone and code payload", async () => {
    await authApi.verifyCode("+375291234567", "123456");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/verify"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          phone: "+375291234567",
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
              "Link Telegram in the app first and send your own contact to the bot before requesting a code.",
          }),
      }),
    );

    await expect(authApi.requestCode("+375291234567")).rejects.toMatchObject({
      code: "TELEGRAM_NOT_LINKED",
    });
  });
});
