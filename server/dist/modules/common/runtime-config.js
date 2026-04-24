"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNodeEnv = getNodeEnv;
exports.isProductionEnv = isProductionEnv;
exports.readBooleanEnv = readBooleanEnv;
exports.getJwtSecret = getJwtSecret;
exports.isDatabaseSynchronizationEnabled = isDatabaseSynchronizationEnabled;
exports.areDemoAccountsEnabled = areDemoAccountsEnabled;
exports.isPasswordLoginEnabled = isPasswordLoginEnabled;
exports.shouldExposeDebugAuthCode = shouldExposeDebugAuthCode;
exports.getCorsOrigins = getCorsOrigins;
exports.getAuthRateLimitWindowMs = getAuthRateLimitWindowMs;
exports.getAuthRateLimitMaxRequests = getAuthRateLimitMaxRequests;
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
function isDatabaseSynchronizationEnabled() {
    return readBooleanEnv("DB_SYNCHRONIZE", !isProductionEnv());
}
function areDemoAccountsEnabled() {
    return readBooleanEnv("AUTH_ENABLE_DEMO_ACCOUNTS", !isProductionEnv());
}
function isPasswordLoginEnabled() {
    return readBooleanEnv("AUTH_ALLOW_PASSWORD_LOGIN", !isProductionEnv());
}
function shouldExposeDebugAuthCode() {
    return readBooleanEnv("AUTH_EXPOSE_DEBUG_CODE", !isProductionEnv());
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