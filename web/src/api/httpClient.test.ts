import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, httpRequest } from "./httpClient";

describe("httpRequest", () => {
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

  it("preserves backend error status, code, message, and details", async () => {
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () =>
          JSON.stringify({
            code: "TELEGRAM_PAIRING_UNAVAILABLE",
            message: "Telegram pairing unavailable",
            details: {
              provider: "telegram",
            },
          }),
      }),
    );

    await expect(
      httpRequest("/auth/telegram/pairing", {
        authMode: "none",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "TELEGRAM_PAIRING_UNAVAILABLE",
      message: "Telegram pairing unavailable",
      backendMessage: "Telegram pairing unavailable",
      details: {
        provider: "telegram",
      },
    } satisfies Partial<ApiError>);

    expect(warningSpy).toHaveBeenCalled();
  });

  it("preserves an internal server message for higher-level error mapping", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () =>
          JSON.stringify({
            statusCode: 500,
            message: "Internal server error",
          }),
      }),
    );

    await expect(
      httpRequest("/boom", {
        authMode: "none",
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: "Internal server error",
      backendMessage: "Internal server error",
    });
  });

  it("marks network failures as errors without an HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(
      httpRequest("/auth/request", {
        authMode: "none",
      }),
    ).rejects.toMatchObject({
      status: 0,
      message: "Network error. Please check your connection.",
    });
  });
});
