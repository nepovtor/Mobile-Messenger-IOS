import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, httpRequest } from "@/shared/api/httpClient";

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

  it("uses cookie credentials without adding an authorization header", async () => {
    await httpRequest("/auth/me");

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(requestInit?.credentials).toBe("include");
    const headers = new Headers(requestInit?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.get("X-Client-Platform")).toBe("web");
  });

  it("refreshes an expired cookie session once and retries the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ message: "Unauthorized" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => "",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ userID: "user-1" }),
        }),
    );

    await expect(httpRequest("/auth/me")).resolves.toEqual({
      userID: "user-1",
    });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/\/auth\/me$/),
      expect.stringMatching(/\/auth\/refresh$/),
      expect.stringMatching(/\/auth\/me$/),
    ]);
    expect(calls.every(([, init]) => init?.credentials === "include")).toBe(
      true,
    );
  });

  it("uses the isolated admin refresh endpoint for admin requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ message: "Unauthorized" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => "",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ login: "operator" }),
        }),
    );

    await httpRequest("/admin/me", { authMode: "admin" });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/\/admin\/me$/),
      expect.stringMatching(/\/admin\/refresh$/),
      expect.stringMatching(/\/admin\/me$/),
    ]);
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
