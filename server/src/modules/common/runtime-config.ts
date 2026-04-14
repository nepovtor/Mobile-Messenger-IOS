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
