const PRODUCTION_API_URL =
  "https://mobile-messenger-ios-production.up.railway.app/api";
const PRODUCTION_WEBSOCKET_URL =
  "wss://mobile-messenger-ios-production.up.railway.app/realtime";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export const appConfig = {
  apiBaseUrl: normalizeBaseUrl(
    import.meta.env.VITE_API_BASE_URL || PRODUCTION_API_URL,
  ),
  websocketUrl: normalizeBaseUrl(
    import.meta.env.VITE_WEBSOCKET_URL || PRODUCTION_WEBSOCKET_URL,
  ),
  requestTimeoutMs: 15000,
};
