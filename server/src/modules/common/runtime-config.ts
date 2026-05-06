export function getNodeEnv(): string {
  return process.env.NODE_ENV?.trim() || "development";
}

export function isProductionEnv(): boolean {
  return getNodeEnv() === "production";
}

export function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }

  return value === "1" || value === "true" || value === "yes";
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || "7d";
}

export function getAdminLogin(): string {
  return process.env.ADMIN_LOGIN?.trim() || "admin";
}

export function getAdminDisplayName(): string {
  return process.env.ADMIN_DISPLAY_NAME?.trim() || "Administrator";
}

export function getAdminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (password) {
    return password;
  }

  if (areDemoAccountsEnabled()) {
    return "admin";
  }

  return isProductionEnv() ? null : "admin";
}

export function isAdminConsoleEnabled(): boolean {
  return Boolean(getAdminPassword());
}

export function getAdminJwtExpiresIn(): string {
  return process.env.ADMIN_JWT_EXPIRES_IN?.trim() || getJwtExpiresIn();
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getWebAppUrl(): string | null {
  const value =
    process.env.WEB_APP_URL?.trim() || process.env.PUBLIC_WEB_URL?.trim();
  return value ? normalizeUrl(value) : null;
}

export function getTelegramSubscriptionAppUrl(
  plan?: "starter" | "team" | "business",
): string | null {
  const baseUrl = getWebAppUrl();
  if (!baseUrl) {
    return null;
  }

  const url = new URL("telegram/subscription", `${baseUrl}/`);
  url.searchParams.set("source", "telegram-bot");
  if (plan) {
    url.searchParams.set("plan", plan);
  }
  return url.toString();
}

export function isDatabaseSynchronizationEnabled(): boolean {
  return readBooleanEnv("DB_SYNCHRONIZE", !isProductionEnv());
}

export function areDemoAccountsEnabled(): boolean {
  return readBooleanEnv("AUTH_ENABLE_DEMO_ACCOUNTS", !isProductionEnv());
}

export function isTestCodeAllowed(): boolean {
  return readBooleanEnv("AUTH_ALLOW_TEST_CODE", !isProductionEnv());
}

export function getAuthTestCode(): string {
  const code = process.env.AUTH_TEST_CODE?.trim() || "123456";
  return /^\d{6}$/.test(code) ? code : "123456";
}

export function getAuthCodeTTLSeconds(): number {
  const value = Number(process.env.AUTH_CODE_TTL_SECONDS || "300");
  return Number.isFinite(value) && value > 0 ? value : 300;
}

export function getAuthCodeMaxAttempts(): number {
  const value = Number(process.env.AUTH_CODE_MAX_ATTEMPTS || "5");
  return Number.isFinite(value) && value > 0 ? value : 5;
}

export function getAuthCodeResendCooldownSeconds(): number {
  const value = Number(process.env.AUTH_CODE_RESEND_COOLDOWN_SECONDS || "60");
  return Number.isFinite(value) && value > 0 ? value : 60;
}

export function isPasswordLoginEnabled(): boolean {
  return readBooleanEnv("AUTH_ALLOW_PASSWORD_LOGIN", !isProductionEnv());
}

export function shouldExposeDebugAuthCode(): boolean {
  return !isProductionEnv() && isTestCodeAllowed();
}

export type SmsProviderName =
  | "console"
  | "twilio"
  | "vonage"
  | "smsru"
  | "mock";

export type VerificationProviderName = "telegram" | "console" | "mock" | "sms";

export function getVerificationProvider(): VerificationProviderName {
  const value = process.env.VERIFICATION_PROVIDER?.trim().toLowerCase();
  switch (value) {
    case "telegram":
    case "console":
    case "mock":
    case "sms":
      return value;
    default:
      switch (getSmsProvider()) {
        case "twilio":
        case "vonage":
        case "smsru":
          return "sms";
        case "mock":
          return "mock";
        case "console":
        default:
          return "console";
      }
  }
}

export function getSmsProvider(): SmsProviderName {
  const value = process.env.SMS_PROVIDER?.trim().toLowerCase();
  switch (value) {
    case "twilio":
    case "vonage":
    case "smsru":
    case "mock":
    case "console":
      return value;
    default:
      return isProductionEnv() ? "console" : "console";
  }
}

export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function getTelegramBotUsername(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@+/, "");
  return username || null;
}

export function hasTelegramBotConfig(): boolean {
  return Boolean(getTelegramBotToken());
}

export function isTelegramTextPhoneLinkingAllowed(): boolean {
  return readBooleanEnv("TELEGRAM_ALLOW_TEXT_PHONE_LINKING", false);
}

export function isTelegramOwnContactRequired(): boolean {
  return readBooleanEnv("TELEGRAM_REQUIRE_OWN_CONTACT", true);
}

export function getTelegramPairingTokenTTLSeconds(): number {
  const value = Number(process.env.TELEGRAM_PAIRING_TOKEN_TTL_SECONDS || "600");
  return Number.isFinite(value) && value > 0 ? value : 600;
}

export function getTelegramLinkResendCooldownSeconds(): number {
  const value = Number(
    process.env.TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS || "60",
  );
  return Number.isFinite(value) && value > 0 ? value : 60;
}

export function isTelegramRelinkAllowed(): boolean {
  return readBooleanEnv("TELEGRAM_ALLOW_RELINK", false);
}

export function getSmsFrom(): string {
  return process.env.SMS_FROM?.trim() || "MobileMsg";
}

export function canUseConsoleSmsInCurrentEnv(): boolean {
  return !isProductionEnv() || isTestCodeAllowed();
}

export function getTwilioConfig(): {
  accountSID: string;
  authToken: string;
  from: string;
} | null {
  const accountSID = process.env.SMS_TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.SMS_TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.SMS_TWILIO_FROM?.trim() || process.env.SMS_FROM?.trim();

  if (!accountSID || !authToken || !from) {
    return null;
  }

  return { accountSID, authToken, from };
}

export function getCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  if (isProductionEnv()) {
    return [];
  }

  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

export function getAuthRateLimitWindowMs(): number {
  const value = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "60000");
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

export function getAuthRateLimitMaxRequests(): number {
  const value = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || "20");
  return Number.isFinite(value) && value > 0 ? value : 20;
}

export function getPhoneRequestRateLimitMaxRequests(): number {
  return 3;
}

export function isDemoChatSeedingEnabled(): boolean {
  return readBooleanEnv("CHAT_ENABLE_DEMO_SEEDING", !isProductionEnv());
}

export function getRealtimeHeartbeatIntervalMs(): number {
  const value = Number(process.env.REALTIME_HEARTBEAT_INTERVAL_MS || "15000");
  return Number.isFinite(value) && value > 0 ? value : 15000;
}

export function getRealtimeHeartbeatTimeoutMs(): number {
  const value = Number(process.env.REALTIME_HEARTBEAT_TIMEOUT_MS || "45000");
  return Number.isFinite(value) && value > 0 ? value : 45000;
}
