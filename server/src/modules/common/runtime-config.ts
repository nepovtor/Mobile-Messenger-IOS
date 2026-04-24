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

export function isDatabaseSynchronizationEnabled(): boolean {
  return readBooleanEnv("DB_SYNCHRONIZE", !isProductionEnv());
}

export function areDemoAccountsEnabled(): boolean {
  return readBooleanEnv("AUTH_ENABLE_DEMO_ACCOUNTS", !isProductionEnv());
}

export function isPasswordLoginEnabled(): boolean {
  return readBooleanEnv("AUTH_ALLOW_PASSWORD_LOGIN", !isProductionEnv());
}

export function shouldExposeDebugAuthCode(): boolean {
  return readBooleanEnv("AUTH_EXPOSE_DEBUG_CODE", !isProductionEnv());
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
