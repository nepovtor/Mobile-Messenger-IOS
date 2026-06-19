import { describe, expect, it } from "vitest";
import { resolveAppConfig } from "./api";

describe("resolveAppConfig", () => {
  it("defaults to the dev proxy in development", () => {
    expect(resolveAppConfig({ DEV: true }, "127.0.0.1")).toEqual({
      apiBaseUrl: "/api",
      websocketUrl: "ws://127.0.0.1:3000/realtime",
      telegramBotUsername: "verificMobileMessengerIOSbot",
      telegramBotUrl: "https://t.me/verificMobileMessengerIOSbot",
      requestTimeoutMs: 15000,
    });
  });

  it("can still connect directly to the local backend when explicitly requested", () => {
    expect(
      resolveAppConfig(
        { DEV: true, VITE_DEV_DIRECT_BACKEND: "true" },
        "127.0.0.1",
      ),
    ).toEqual({
      apiBaseUrl: "http://127.0.0.1:8080/api",
      websocketUrl: "ws://127.0.0.1:8080/realtime",
      telegramBotUsername: "verificMobileMessengerIOSbot",
      telegramBotUrl: "https://t.me/verificMobileMessengerIOSbot",
      requestTimeoutMs: 15000,
    });
  });

  it("keeps production fallbacks when local dev overrides are absent", () => {
    expect(resolveAppConfig({ DEV: false }, "127.0.0.1")).toEqual({
      apiBaseUrl: "https://phpstack-1634854-6489525.cloudwaysapps.com/api",
      websocketUrl:
        "wss://phpstack-1634854-6489525.cloudwaysapps.com/realtime",
      telegramBotUsername: "verificMobileMessengerIOSbot",
      telegramBotUrl: "https://t.me/verificMobileMessengerIOSbot",
      requestTimeoutMs: 15000,
    });
  });
});
