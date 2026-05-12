function readEnv(name: string): string | undefined {
  return process.env[name];
}

export function getNodeEnv(): string {
  return readEnv("NODE_ENV")?.trim() || "development";
}

const LOCAL_WEB_APP_URL = "http://127.0.0.1:3000";
const LOCAL_WEB_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

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
  const secret =
    readEnv("JWT_SECRET_KEY")?.trim() || readEnv("JWT_SECRET")?.trim();
  if (!secret) {
    throw new Error(
      "JWT_SECRET_KEY or JWT_SECRET environment variable is required",
    );
  }
  return secret;
}

export function isJwtConfigured(): boolean {
  return Boolean(
    readEnv("JWT_SECRET_KEY")?.trim() || readEnv("JWT_SECRET")?.trim(),
  );
}

export function getJwtExpiresIn(): string {
  return readEnv("JWT_EXPIRES_IN")?.trim() || "7d";
}

export function getAdminLogin(): string {
  return readEnv("ADMIN_LOGIN")?.trim() || "admin";
}

export function getAdminDisplayName(): string {
  return readEnv("ADMIN_DISPLAY_NAME")?.trim() || "Administrator";
}

export function getAdminPassword(): string | null {
  const password = readEnv("ADMIN_PASSWORD")?.trim();
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
  return readEnv("ADMIN_JWT_EXPIRES_IN")?.trim() || getJwtExpiresIn();
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getS3Endpoint(): string | null {
  const value = readEnv("S3_ENDPOINT")?.trim();
  return value ? normalizeUrl(value) : null;
}

export function getS3PublicEndpoint(): string | null {
  const value = readEnv("S3_PUBLIC_ENDPOINT")?.trim();
  if (value) {
    return normalizeUrl(value);
  }

  return getS3Endpoint();
}

export function getS3Bucket(): string {
  return readEnv("S3_BUCKET")?.trim() || "messenger-media";
}

export function getS3Region(): string {
  return readEnv("S3_REGION")?.trim() || "us-east-1";
}

export function isS3ForcePathStyle(): boolean {
  return readBooleanEnv("S3_FORCE_PATH_STYLE", true);
}

export function getWebAppUrl(): string | null {
  const value =
    readEnv("WEB_APP_URL")?.trim() || readEnv("PUBLIC_WEB_URL")?.trim();
  if (value) {
    return normalizeUrl(value);
  }

  return isProductionEnv() ? null : LOCAL_WEB_APP_URL;
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
  const code = readEnv("AUTH_TEST_CODE")?.trim() || "123456";
  return /^\d{6}$/.test(code) ? code : "123456";
}

export function getAuthCodeTTLSeconds(): number {
  const value = Number(readEnv("AUTH_CODE_TTL_SECONDS") || "300");
  return Number.isFinite(value) && value > 0 ? value : 300;
}

export function getAuthCodeMaxAttempts(): number {
  const value = Number(readEnv("AUTH_CODE_MAX_ATTEMPTS") || "5");
  return Number.isFinite(value) && value > 0 ? value : 5;
}

export function getAuthCodeResendCooldownSeconds(): number {
  const value = Number(readEnv("AUTH_CODE_RESEND_COOLDOWN_SECONDS") || "60");
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
  const value = readEnv("VERIFICATION_PROVIDER")?.trim().toLowerCase();
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
  const value = readEnv("SMS_PROVIDER")?.trim().toLowerCase();
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
  const token = readEnv("TELEGRAM_BOT_TOKEN")?.trim();
  return token || null;
}

export function getTelegramBotUsername(): string | null {
  const username = readEnv("TELEGRAM_BOT_USERNAME")?.trim().replace(/^@+/, "");
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
  const value = Number(readEnv("TELEGRAM_PAIRING_TOKEN_TTL_SECONDS") || "600");
  return Number.isFinite(value) && value > 0 ? value : 600;
}

export function getTelegramLinkResendCooldownSeconds(): number {
  const value = Number(
    readEnv("TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS") || "60",
  );
  return Number.isFinite(value) && value > 0 ? value : 60;
}

export function isTelegramRelinkAllowed(): boolean {
  return readBooleanEnv("TELEGRAM_ALLOW_RELINK", false);
}

export function getSmsFrom(): string {
  return readEnv("SMS_FROM")?.trim() || "MobileMsg";
}

export function canUseConsoleSmsInCurrentEnv(): boolean {
  return !isProductionEnv() || isTestCodeAllowed();
}

export function getTwilioConfig(): {
  accountSID: string;
  authToken: string;
  from: string;
} | null {
  const accountSID = readEnv("SMS_TWILIO_ACCOUNT_SID")?.trim();
  const authToken = readEnv("SMS_TWILIO_AUTH_TOKEN")?.trim();
  const from =
    readEnv("SMS_TWILIO_FROM")?.trim() || readEnv("SMS_FROM")?.trim();

  if (!accountSID || !authToken || !from) {
    return null;
  }

  return { accountSID, authToken, from };
}

export function getCorsOrigins(): string[] {
  const configured = readEnv("CORS_ORIGINS")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  if (isProductionEnv()) {
    return [];
  }

  return LOCAL_WEB_ORIGINS;
}

export function getAuthRateLimitWindowMs(): number {
  const value = Number(readEnv("AUTH_RATE_LIMIT_WINDOW_MS") || "60000");
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

export function getAuthRateLimitMaxRequests(): number {
  const value = Number(readEnv("AUTH_RATE_LIMIT_MAX_REQUESTS") || "20");
  return Number.isFinite(value) && value > 0 ? value : 20;
}

export function getPhoneRequestRateLimitMaxRequests(): number {
  return 3;
}

export function isDemoChatSeedingEnabled(): boolean {
  return readBooleanEnv("CHAT_ENABLE_DEMO_SEEDING", !isProductionEnv());
}

export function getRealtimeHeartbeatIntervalMs(): number {
  const value = Number(readEnv("REALTIME_HEARTBEAT_INTERVAL_MS") || "15000");
  return Number.isFinite(value) && value > 0 ? value : 15000;
}

export function getRealtimeHeartbeatTimeoutMs(): number {
  const value = Number(readEnv("REALTIME_HEARTBEAT_TIMEOUT_MS") || "45000");
  return Number.isFinite(value) && value > 0 ? value : 45000;
}

function normalizeMultilineSecret(value: string): string {
  return value.replace(/\\n/g, "\n");
}

export function getWebPushVapidPublicKey(): string {
  const value = readEnv("WEB_PUSH_VAPID_PUBLIC_KEY")?.trim();
  if (!value) {
    throw new Error(
      "WEB_PUSH_VAPID_PUBLIC_KEY environment variable is required",
    );
  }
  return value;
}

export function getWebPushVapidPrivateKey(): string {
  const value = readEnv("WEB_PUSH_VAPID_PRIVATE_KEY")?.trim();
  if (!value) {
    throw new Error(
      "WEB_PUSH_VAPID_PRIVATE_KEY environment variable is required",
    );
  }
  return value;
}

export function getWebPushVapidSubject(): string {
  const value = readEnv("WEB_PUSH_VAPID_SUBJECT")?.trim();
  if (!value) {
    throw new Error("WEB_PUSH_VAPID_SUBJECT environment variable is required");
  }
  return value;
}

export function hasWebPushConfig(): boolean {
  return Boolean(
    readEnv("WEB_PUSH_VAPID_PUBLIC_KEY")?.trim() &&
    readEnv("WEB_PUSH_VAPID_PRIVATE_KEY")?.trim() &&
    readEnv("WEB_PUSH_VAPID_SUBJECT")?.trim(),
  );
}

export function getApnsConfig(): {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
  environment: "sandbox" | "production";
} | null {
  const teamId = readEnv("APNS_TEAM_ID")?.trim();
  const keyId = readEnv("APNS_KEY_ID")?.trim();
  const bundleId = readEnv("APNS_BUNDLE_ID")?.trim();
  const privateKey = readEnv("APNS_PRIVATE_KEY")?.trim();
  const environment =
    readEnv("APNS_ENVIRONMENT")?.trim().toLowerCase() === "production"
      ? "production"
      : "sandbox";

  if (!teamId || !keyId || !bundleId || !privateKey) {
    return null;
  }

  return {
    teamId,
    keyId,
    bundleId,
    privateKey: normalizeMultilineSecret(privateKey),
    environment,
  };
}

export function isPushTestEndpointEnabled(): boolean {
  return readBooleanEnv("PUSH_ALLOW_TEST_ENDPOINT", !isProductionEnv());
}
