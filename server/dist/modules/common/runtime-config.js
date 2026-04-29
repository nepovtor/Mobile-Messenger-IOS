"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNodeEnv = getNodeEnv;
exports.isProductionEnv = isProductionEnv;
exports.readBooleanEnv = readBooleanEnv;
exports.getJwtSecret = getJwtSecret;
exports.getJwtExpiresIn = getJwtExpiresIn;
exports.isDatabaseSynchronizationEnabled = isDatabaseSynchronizationEnabled;
exports.areDemoAccountsEnabled = areDemoAccountsEnabled;
exports.isTestCodeAllowed = isTestCodeAllowed;
exports.getAuthTestCode = getAuthTestCode;
exports.getAuthCodeTTLSeconds = getAuthCodeTTLSeconds;
exports.getAuthCodeMaxAttempts = getAuthCodeMaxAttempts;
exports.getAuthCodeResendCooldownSeconds = getAuthCodeResendCooldownSeconds;
exports.isPasswordLoginEnabled = isPasswordLoginEnabled;
exports.shouldExposeDebugAuthCode = shouldExposeDebugAuthCode;
exports.getVerificationProvider = getVerificationProvider;
exports.getSmsProvider = getSmsProvider;
exports.getTelegramBotToken = getTelegramBotToken;
exports.getTelegramBotUsername = getTelegramBotUsername;
exports.hasTelegramBotConfig = hasTelegramBotConfig;
exports.getSmsFrom = getSmsFrom;
exports.canUseConsoleSmsInCurrentEnv = canUseConsoleSmsInCurrentEnv;
exports.getTwilioConfig = getTwilioConfig;
exports.getCorsOrigins = getCorsOrigins;
exports.getAuthRateLimitWindowMs = getAuthRateLimitWindowMs;
exports.getAuthRateLimitMaxRequests = getAuthRateLimitMaxRequests;
exports.getPhoneRequestRateLimitMaxRequests = getPhoneRequestRateLimitMaxRequests;
exports.isDemoChatSeedingEnabled = isDemoChatSeedingEnabled;
exports.getRealtimeHeartbeatIntervalMs = getRealtimeHeartbeatIntervalMs;
exports.getRealtimeHeartbeatTimeoutMs = getRealtimeHeartbeatTimeoutMs;
function getNodeEnv() {
    return process.env.NODE_ENV?.trim() || "development";
}
function isProductionEnv() {
    return getNodeEnv() === "production";
}
function readBooleanEnv(name, defaultValue) {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) {
        return defaultValue;
    }
    return value === "1" || value === "true" || value === "yes";
}
function getJwtSecret() {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        throw new Error("JWT_SECRET environment variable is required");
    }
    return secret;
}
function getJwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN?.trim() || "7d";
}
function isDatabaseSynchronizationEnabled() {
    return readBooleanEnv("DB_SYNCHRONIZE", !isProductionEnv());
}
function areDemoAccountsEnabled() {
    return readBooleanEnv("AUTH_ENABLE_DEMO_ACCOUNTS", !isProductionEnv());
}
function isTestCodeAllowed() {
    return readBooleanEnv("AUTH_ALLOW_TEST_CODE", !isProductionEnv());
}
function getAuthTestCode() {
    const code = process.env.AUTH_TEST_CODE?.trim() || "123456";
    return /^\d{6}$/.test(code) ? code : "123456";
}
function getAuthCodeTTLSeconds() {
    const value = Number(process.env.AUTH_CODE_TTL_SECONDS || "300");
    return Number.isFinite(value) && value > 0 ? value : 300;
}
function getAuthCodeMaxAttempts() {
    const value = Number(process.env.AUTH_CODE_MAX_ATTEMPTS || "5");
    return Number.isFinite(value) && value > 0 ? value : 5;
}
function getAuthCodeResendCooldownSeconds() {
    const value = Number(process.env.AUTH_CODE_RESEND_COOLDOWN_SECONDS || "60");
    return Number.isFinite(value) && value > 0 ? value : 60;
}
function isPasswordLoginEnabled() {
    return readBooleanEnv("AUTH_ALLOW_PASSWORD_LOGIN", !isProductionEnv());
}
function shouldExposeDebugAuthCode() {
    return !isProductionEnv() && isTestCodeAllowed();
}
function getVerificationProvider() {
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
function getSmsProvider() {
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
function getTelegramBotToken() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    return token || null;
}
function getTelegramBotUsername() {
    const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@+/, "");
    return username || null;
}
function hasTelegramBotConfig() {
    return Boolean(getTelegramBotToken());
}
function getSmsFrom() {
    return process.env.SMS_FROM?.trim() || "MobileMsg";
}
function canUseConsoleSmsInCurrentEnv() {
    return !isProductionEnv() || isTestCodeAllowed();
}
function getTwilioConfig() {
    const accountSID = process.env.SMS_TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.SMS_TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.SMS_TWILIO_FROM?.trim() || process.env.SMS_FROM?.trim();
    if (!accountSID || !authToken || !from) {
        return null;
    }
    return { accountSID, authToken, from };
}
function getCorsOrigins() {
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
function getAuthRateLimitWindowMs() {
    const value = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "60000");
    return Number.isFinite(value) && value > 0 ? value : 60000;
}
function getAuthRateLimitMaxRequests() {
    const value = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || "20");
    return Number.isFinite(value) && value > 0 ? value : 20;
}
function getPhoneRequestRateLimitMaxRequests() {
    return 3;
}
function isDemoChatSeedingEnabled() {
    return readBooleanEnv("CHAT_ENABLE_DEMO_SEEDING", !isProductionEnv());
}
function getRealtimeHeartbeatIntervalMs() {
    const value = Number(process.env.REALTIME_HEARTBEAT_INTERVAL_MS || "15000");
    return Number.isFinite(value) && value > 0 ? value : 15000;
}
function getRealtimeHeartbeatTimeoutMs() {
    const value = Number(process.env.REALTIME_HEARTBEAT_TIMEOUT_MS || "45000");
    return Number.isFinite(value) && value > 0 ? value : 45000;
}
//# sourceMappingURL=runtime-config.js.map