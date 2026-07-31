function readEnv(name: string): string | undefined {
  return process.env[name];
}

function readTrimmedEnv(name: string): string | undefined {
  const value = readEnv(name)?.trim();
  return value || undefined;
}

function readFirstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = readTrimmedEnv(name);
    if (value) {
      return value;
    }
  }
  return undefined;
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

const CURRENT_JWT_KEY_ID_ENV_NAMES = ["JWT_ACCESS_CURRENT_KEY_ID"] as const;
const LEGACY_CURRENT_JWT_KEY_ID_ENV_NAMES = ["JWT_ACCESS_CURRENT_KID"] as const;
const CURRENT_JWT_SECRET_ENV_NAMES = ["JWT_ACCESS_CURRENT_SECRET"] as const;
const LEGACY_JWT_SECRET_ENV_NAMES = ["JWT_SECRET_KEY", "JWT_SECRET"] as const;
const PREVIOUS_JWT_KEY_ID_ENV_NAMES = ["JWT_ACCESS_PREVIOUS_KEY_ID"] as const;
const LEGACY_PREVIOUS_JWT_KEY_ID_ENV_NAMES = [
  "JWT_ACCESS_PREVIOUS_KID",
] as const;
const PREVIOUS_JWT_SECRET_ENV_NAMES = ["JWT_ACCESS_PREVIOUS_SECRET"] as const;
const LEGACY_PREVIOUS_JWT_SECRET_ENV_NAMES = ["JWT_PREVIOUS_SECRET"] as const;

const SECRET_MIN_LENGTH = 32;
const ACCESS_TOKEN_MIN_TTL_SECONDS = 60;
const ACCESS_TOKEN_MAX_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_MIN_TTL_SECONDS = 24 * 60 * 60;
const REFRESH_TOKEN_MAX_TTL_SECONDS = 90 * 24 * 60 * 60;

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
    readFirstEnv(CURRENT_JWT_SECRET_ENV_NAMES) ??
    (!isProductionEnv()
      ? readFirstEnv(LEGACY_JWT_SECRET_ENV_NAMES)
      : undefined);
  if (!secret) {
    throw new Error(
      isProductionEnv()
        ? "JWT_ACCESS_CURRENT_SECRET environment variable is required"
        : "JWT_ACCESS_CURRENT_SECRET, JWT_SECRET_KEY or JWT_SECRET environment variable is required",
    );
  }
  return secret;
}

export function isJwtConfigured(): boolean {
  return Boolean(
    readFirstEnv(CURRENT_JWT_SECRET_ENV_NAMES) ??
    (!isProductionEnv()
      ? readFirstEnv(LEGACY_JWT_SECRET_ENV_NAMES)
      : undefined),
  );
}

export function getJwtExpiresIn(): string {
  return getJwtAccessTokenExpiresIn();
}

export function getJwtAccessCurrentKeyId(): string {
  return (
    readFirstEnv(CURRENT_JWT_KEY_ID_ENV_NAMES) ??
    (!isProductionEnv()
      ? readFirstEnv(LEGACY_CURRENT_JWT_KEY_ID_ENV_NAMES)
      : undefined) ??
    "legacy"
  );
}

export function getJwtAccessCurrentSecret(): string {
  return getJwtSecret();
}

export function getJwtAccessPreviousKeyId(): string | null {
  return (
    readFirstEnv(PREVIOUS_JWT_KEY_ID_ENV_NAMES) ??
    (!isProductionEnv()
      ? readFirstEnv(LEGACY_PREVIOUS_JWT_KEY_ID_ENV_NAMES)
      : undefined) ??
    null
  );
}

export function getJwtAccessPreviousSecret(): string | null {
  return (
    readFirstEnv(PREVIOUS_JWT_SECRET_ENV_NAMES) ??
    (!isProductionEnv()
      ? readFirstEnv(LEGACY_PREVIOUS_JWT_SECRET_ENV_NAMES)
      : undefined) ??
    null
  );
}

export function getJwtIssuer(): string {
  return readTrimmedEnv("JWT_ISSUER") ?? "mobile-messenger-api";
}

export function getJwtAudience(): string {
  return readTrimmedEnv("JWT_AUDIENCE") ?? "mobile-messenger-clients";
}

export function getJwtAccessTokenExpiresIn(): string {
  return readFirstEnv(["JWT_ACCESS_EXPIRES_IN", "JWT_EXPIRES_IN"]) ?? "10m";
}

export function getJwtRefreshTokenExpiresIn(): string {
  return readTrimmedEnv("JWT_REFRESH_EXPIRES_IN") ?? "30d";
}

export function getOtpPepper(): string {
  return readTrimmedEnv("OTP_PEPPER") ?? getJwtSecret();
}

export function getRefreshTokenPepper(): string {
  const pepper = readTrimmedEnv("REFRESH_TOKEN_PEPPER");
  if (pepper) {
    return pepper;
  }
  if (!isProductionEnv()) {
    return getJwtSecret();
  }
  throw new Error("REFRESH_TOKEN_PEPPER environment variable is required");
}

export function getLogIpHashKey(): string | null {
  return readTrimmedEnv("LOG_IP_HASH_KEY") ?? null;
}

export type CookieSameSite = "lax" | "strict" | "none";

export function isCookieSecure(): boolean {
  return readBooleanEnv("COOKIE_SECURE", isProductionEnv());
}

export function getCookieSameSite(): CookieSameSite {
  const value = readTrimmedEnv("COOKIE_SAME_SITE")?.toLowerCase();
  return value === "lax" || value === "none" || value === "strict"
    ? value
    : "strict";
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

export function getS3AccessKey(): string | null {
  return readTrimmedEnv("S3_ACCESS_KEY") ?? null;
}

export function getS3SecretKey(): string | null {
  return readTrimmedEnv("S3_SECRET_KEY") ?? null;
}

export function isS3TlsEnabled(): boolean {
  const configured =
    readTrimmedEnv("S3_TLS_ENABLED") ?? readTrimmedEnv("S3_USE_SSL");
  if (configured) {
    return ["1", "true", "yes"].includes(configured.toLowerCase());
  }

  const endpoint = getS3Endpoint();
  return endpoint ? endpoint.startsWith("https://") : false;
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
  if (readTrimmedEnv("PASSWORD_LOGIN_ENABLED") !== undefined) {
    return readBooleanEnv("PASSWORD_LOGIN_ENABLED", false);
  }
  return readBooleanEnv("AUTH_ALLOW_PASSWORD_LOGIN", !isProductionEnv());
}

export function isE2EEEnabled(): boolean {
  return readBooleanEnv("E2EE_ENABLED", false);
}

export function isE2EERequired(): boolean {
  return readBooleanEnv("E2EE_REQUIRED", false);
}

export function isLegacyMessagesReadEnabled(): boolean {
  return readBooleanEnv("LEGACY_MESSAGES_READ_ENABLED", true);
}

export function isAdminIpAllowlistEnabled(): boolean {
  return readBooleanEnv("ADMIN_IP_ALLOWLIST_ENABLED", false);
}

export function getAdminIpAllowlist(): string[] {
  return (readTrimmedEnv("ADMIN_IP_ALLOWLIST") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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

export function parseOriginAllowlist(
  value: string | undefined,
  options: {
    variableName: string;
    requireHttps?: boolean;
  },
): string[] {
  if (!value?.trim()) {
    return [];
  }

  const origins = new Set<string>();
  for (const entry of value.split(",")) {
    const candidate = entry.trim();
    if (!candidate) {
      continue;
    }
    if (candidate === "*" || candidate.includes("*")) {
      throw new Error(
        `${options.variableName} must be an explicit allowlist; wildcard origins are forbidden with credentialed requests`,
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(
        `${options.variableName} contains an invalid origin: ${candidate}`,
      );
    }

    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        `${options.variableName} contains an invalid origin: ${candidate}`,
      );
    }
    if (options.requireHttps && parsed.protocol !== "https:") {
      throw new Error(
        `${options.variableName} must contain only https origins in production`,
      );
    }

    origins.add(parsed.origin);
  }
  return Array.from(origins);
}

export function getCorsOrigins(): string[] {
  const configured = parseOriginAllowlist(readEnv("CORS_ORIGINS"), {
    variableName: "CORS_ORIGINS",
    requireHttps: isProductionEnv(),
  });
  if (configured.length > 0) {
    return configured;
  }
  return isProductionEnv() ? [] : [...LOCAL_WEB_ORIGINS];
}

export function getWebSocketOrigins(): string[] {
  const configured = parseOriginAllowlist(readEnv("WS_ORIGINS"), {
    variableName: "WS_ORIGINS",
    requireHttps: isProductionEnv(),
  });
  if (configured.length > 0) {
    return configured;
  }
  return isProductionEnv() ? [] : getCorsOrigins();
}

export const getWsOrigins = getWebSocketOrigins;

export function getContentSecurityPolicyConnectSources(): string[] {
  const sources = new Set<string>(["'self'"]);
  for (const origin of [...getCorsOrigins(), ...getWebSocketOrigins()]) {
    sources.add(origin);
    const url = new URL(origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    sources.add(url.origin);
  }
  return Array.from(sources);
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

export function getRealtimeSessionRevalidationIntervalMs(): number {
  const value = Number(
    readEnv("REALTIME_SESSION_REVALIDATION_INTERVAL_MS") || "30000",
  );
  return Number.isFinite(value) && value >= 50 ? value : 30_000;
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

export function parseDurationSeconds(value: string): number | null {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim().toLowerCase());
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  const multiplier = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  }[match[2] as "s" | "m" | "h" | "d"];
  return amount * multiplier;
}

function isBooleanEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ["0", "1", "false", "no", "true", "yes"].includes(
    value.trim().toLowerCase(),
  );
}

function isWeakSecret(value: string): boolean {
  if (value.length < SECRET_MIN_LENGTH) {
    return true;
  }

  const normalized = value.toLowerCase();
  return [
    "admin",
    "change-me",
    "changeme",
    "example",
    "minioadmin",
    "password",
    "replace-me",
    "secret",
    "test-secret",
  ].some((unsafeValue) => normalized.includes(unsafeValue));
}

function isValidKeyId(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function requireProductionValue(
  errors: string[],
  name: string,
  aliases: readonly string[] = [],
): string | null {
  const value = readFirstEnv([name, ...aliases]);
  if (!value) {
    errors.push(`${name} is required in production`);
    return null;
  }
  return value;
}

function validateProductionSecret(
  errors: string[],
  name: string,
  aliases: readonly string[] = [],
): string | null {
  const value = requireProductionValue(errors, name, aliases);
  if (value && isWeakSecret(value)) {
    errors.push(
      `${name} must be at least ${SECRET_MIN_LENGTH} characters and must not be a placeholder/default value`,
    );
  }
  return value;
}

export function validateRuntimeConfig(): void {
  if (!isProductionEnv()) {
    return;
  }

  const errors: string[] = [];
  const currentKeyId = requireProductionValue(
    errors,
    "JWT_ACCESS_CURRENT_KEY_ID",
  );
  const currentSecret = validateProductionSecret(
    errors,
    "JWT_ACCESS_CURRENT_SECRET",
  );
  const previousKeyId = requireProductionValue(
    errors,
    "JWT_ACCESS_PREVIOUS_KEY_ID",
  );
  const previousSecret = validateProductionSecret(
    errors,
    "JWT_ACCESS_PREVIOUS_SECRET",
  );
  const issuer = requireProductionValue(errors, "JWT_ISSUER");
  const audience = requireProductionValue(errors, "JWT_AUDIENCE");
  const otpPepper = validateProductionSecret(errors, "OTP_PEPPER");
  const refreshTokenPepper = validateProductionSecret(
    errors,
    "REFRESH_TOKEN_PEPPER",
  );
  const logIpHashKey = validateProductionSecret(errors, "LOG_IP_HASH_KEY");

  if (currentKeyId && !isValidKeyId(currentKeyId)) {
    errors.push("JWT_ACCESS_CURRENT_KEY_ID has an invalid format");
  }
  if (previousKeyId && !isValidKeyId(previousKeyId)) {
    errors.push("JWT_ACCESS_PREVIOUS_KEY_ID has an invalid format");
  }
  if (currentKeyId && previousKeyId && currentKeyId === previousKeyId) {
    errors.push("JWT current and previous key IDs must be different");
  }

  const secrets = [
    currentSecret,
    previousSecret,
    otpPepper,
    refreshTokenPepper,
    logIpHashKey,
  ].filter((value): value is string => Boolean(value));
  if (new Set(secrets).size !== secrets.length) {
    errors.push(
      "JWT, OTP, refresh-token and log-IP secrets must be independent values",
    );
  }
  if (issuer && issuer.length > 200) {
    errors.push("JWT_ISSUER must not exceed 200 characters");
  }
  if (audience && audience.length > 200) {
    errors.push("JWT_AUDIENCE must not exceed 200 characters");
  }

  const accessTtl = getJwtAccessTokenExpiresIn();
  const accessTtlSeconds = parseDurationSeconds(accessTtl);
  if (
    accessTtlSeconds === null ||
    accessTtlSeconds < ACCESS_TOKEN_MIN_TTL_SECONDS ||
    accessTtlSeconds > ACCESS_TOKEN_MAX_TTL_SECONDS
  ) {
    errors.push("JWT_ACCESS_EXPIRES_IN must be between 60s and 15m");
  }

  const refreshTtl = getJwtRefreshTokenExpiresIn();
  const refreshTtlSeconds = parseDurationSeconds(refreshTtl);
  if (
    refreshTtlSeconds === null ||
    refreshTtlSeconds < REFRESH_TOKEN_MIN_TTL_SECONDS ||
    refreshTtlSeconds > REFRESH_TOKEN_MAX_TTL_SECONDS
  ) {
    errors.push("JWT_REFRESH_EXPIRES_IN must be between 1d and 90d");
  }

  let corsOrigins: string[] = [];
  let webSocketOrigins: string[] = [];
  try {
    corsOrigins = getCorsOrigins();
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "Invalid CORS_ORIGINS",
    );
  }
  try {
    webSocketOrigins = getWebSocketOrigins();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid WS_ORIGINS");
  }
  if (corsOrigins.length === 0) {
    errors.push("CORS_ORIGINS must contain at least one production origin");
  }
  if (webSocketOrigins.length === 0) {
    errors.push("WS_ORIGINS must contain at least one production origin");
  }

  const s3Endpoint = requireProductionValue(errors, "S3_ENDPOINT");
  const s3AccessKey = requireProductionValue(errors, "S3_ACCESS_KEY");
  const s3SecretKey = validateProductionSecret(errors, "S3_SECRET_KEY");
  const s3Bucket = requireProductionValue(errors, "S3_BUCKET");
  requireProductionValue(errors, "S3_REGION");
  const s3TlsValue =
    readTrimmedEnv("S3_TLS_ENABLED") ?? readTrimmedEnv("S3_USE_SSL");
  if (!s3TlsValue || !isBooleanEnvValue(s3TlsValue)) {
    errors.push("S3_TLS_ENABLED must be explicitly configured as true");
  } else if (!isS3TlsEnabled()) {
    errors.push("S3_TLS_ENABLED must be true in production");
  }

  if (s3Endpoint) {
    try {
      const endpointUrl = new URL(s3Endpoint);
      if (
        endpointUrl.protocol !== "https:" ||
        endpointUrl.username ||
        endpointUrl.password
      ) {
        errors.push(
          "S3_ENDPOINT must be an https URL without embedded credentials",
        );
      }
    } catch {
      errors.push("S3_ENDPOINT must be a valid https URL");
    }
  }
  const s3PublicEndpoint = readTrimmedEnv("S3_PUBLIC_ENDPOINT");
  if (s3PublicEndpoint) {
    try {
      if (new URL(s3PublicEndpoint).protocol !== "https:") {
        errors.push("S3_PUBLIC_ENDPOINT must use https in production");
      }
    } catch {
      errors.push("S3_PUBLIC_ENDPOINT must be a valid https URL");
    }
  }
  if (
    s3AccessKey &&
    ["admin", "minioadmin"].includes(s3AccessKey.toLowerCase())
  ) {
    errors.push("S3_ACCESS_KEY must not use default credentials");
  }
  if (
    s3SecretKey &&
    ["admin", "minioadmin"].includes(s3SecretKey.toLowerCase())
  ) {
    errors.push("S3_SECRET_KEY must not use default credentials");
  }
  if (s3Bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3Bucket)) {
    errors.push("S3_BUCKET must be a valid private S3 bucket name");
  }

  if (!isE2EEEnabled()) {
    errors.push("E2EE_ENABLED must be true in production");
  }
  if (!isE2EERequired()) {
    errors.push("E2EE_REQUIRED must be true in production");
  }
  if (isDatabaseSynchronizationEnabled()) {
    errors.push("DB_SYNCHRONIZE must be false in production");
  }
  if (areDemoAccountsEnabled()) {
    errors.push("AUTH_ENABLE_DEMO_ACCOUNTS must be false in production");
  }
  if (isTestCodeAllowed()) {
    errors.push("AUTH_ALLOW_TEST_CODE must be false in production");
  }

  const cookieSecureValue = readTrimmedEnv("COOKIE_SECURE");
  if (
    cookieSecureValue &&
    (!isBooleanEnvValue(cookieSecureValue) || !isCookieSecure())
  ) {
    errors.push("COOKIE_SECURE must be true in production");
  }
  if (getCookieSameSite() === "none" && !isCookieSecure()) {
    errors.push("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
  }
  if (isAdminIpAllowlistEnabled() && getAdminIpAllowlist().length === 0) {
    errors.push(
      "ADMIN_IP_ALLOWLIST must not be empty when ADMIN_IP_ALLOWLIST_ENABLED=true",
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Runtime configuration validation failed:\n${errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
}
