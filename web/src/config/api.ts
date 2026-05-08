const PRODUCTION_API_URL =
  "https://mobile-messenger-ios-production.up.railway.app/api";
const PRODUCTION_WEBSOCKET_URL =
  "wss://mobile-messenger-ios-production.up.railway.app/realtime";
const PRODUCTION_TELEGRAM_BOT_USERNAME = "verificMobileMessengerIOSbot";
const LOCAL_BACKEND_PORT = 8080;
const DEV_API_PATH = "/api";
const DEV_REALTIME_PATH = "/realtime";

type AppConfigEnv = {
  DEV?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_DEV_DIRECT_BACKEND?: string;
  VITE_WEBSOCKET_URL?: string;
  VITE_TELEGRAM_BOT_USERNAME?: string;
};

export type AppConfig = {
  apiBaseUrl: string;
  websocketUrl: string;
  telegramBotUsername: string;
  telegramBotUrl: string | null;
  requestTimeoutMs: number;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function detectBrowserHostname(): string {
  if (typeof window !== "undefined" && window.location.hostname) {
    return window.location.hostname;
  }

  return "127.0.0.1";
}

function buildLocalApiUrl(hostname: string): string {
  return `http://${hostname}:${LOCAL_BACKEND_PORT}/api`;
}

function buildLocalWebsocketUrl(hostname: string): string {
  return `ws://${hostname}:${LOCAL_BACKEND_PORT}/realtime`;
}

function buildCurrentOriginWebsocketUrl(hostname: string): string {
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss"
      : "ws";
  const port =
    typeof window !== "undefined" && window.location.port
      ? `:${window.location.port}`
      : "";
  return `${protocol}://${hostname}${port}${DEV_REALTIME_PATH}`;
}

export function resolveAppConfig(
  env: AppConfigEnv,
  hostname = detectBrowserHostname(),
): AppConfig {
  const apiBaseUrl = normalizeBaseUrl(
    env.VITE_API_BASE_URL ||
      (env.DEV
        ? env.VITE_DEV_DIRECT_BACKEND === "true"
          ? buildLocalApiUrl(hostname)
          : DEV_API_PATH
        : PRODUCTION_API_URL),
  );
  const websocketUrl = normalizeBaseUrl(
    env.VITE_WEBSOCKET_URL ||
      (env.DEV
        ? env.VITE_DEV_DIRECT_BACKEND === "true"
          ? buildLocalWebsocketUrl(hostname)
          : buildCurrentOriginWebsocketUrl(hostname)
        : PRODUCTION_WEBSOCKET_URL),
  );
  const telegramBotUsername = (
    env.VITE_TELEGRAM_BOT_USERNAME || PRODUCTION_TELEGRAM_BOT_USERNAME
  )
    .trim()
    .replace(/^@+/, "");

  return {
    apiBaseUrl,
    websocketUrl,
    telegramBotUsername,
    telegramBotUrl: telegramBotUsername
      ? `https://t.me/${telegramBotUsername}`
      : null,
    requestTimeoutMs: 15000,
  };
}

export const appConfig = resolveAppConfig(
  import.meta.env,
  detectBrowserHostname(),
);
