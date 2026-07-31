import { createHmac, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import type { NextFunction, Request, Response } from "express";
import type { JsonObject, JsonValue } from "./json.types";
import { getLogIpHashKey, isProductionEnv } from "./runtime-config";

export type LogFileKind = "app" | "request" | "error";
export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  kind: LogFileKind;
  context: string;
  message: string;
  meta: JsonObject | null;
};

type LogMeta = {
  [key: string]: unknown;
};

type PrincipalLike = {
  sub?: unknown;
};

type RequestWithSecurityContext = Request & {
  admin?: PrincipalLike;
  requestId?: string;
  route?: {
    path?: string | string[];
  };
  user?: PrincipalLike;
};

export type SafeRequestLogMeta = {
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  userID: string | null;
  ipHash: string | null;
  errorCode: string | null;
};

const REDACTED = "[redacted]";
const MAX_LOG_STRING_LENGTH = 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_LOG_KEYS = new Set([
  "context",
  "durationms",
  "errorcode",
  "eventtype",
  "iphash",
  "kind",
  "level",
  "method",
  "requestid",
  "route",
  "statuscode",
  "timestamp",
  "userid",
]);
const SENSITIVE_EXACT_KEYS = new Set([
  "addressbook",
  "authorization",
  "body",
  "ciphertext",
  "code",
  "codehash",
  "contact",
  "contacts",
  "cookie",
  "cookies",
  "coordinates",
  "devicetoken",
  "endpoint",
  "filekey",
  "headers",
  "identitykey",
  "ip",
  "jwt",
  "latitude",
  "location",
  "longitude",
  "message",
  "messagetext",
  "nonce",
  "objectkey",
  "otp",
  "password",
  "passwordhash",
  "phone",
  "phonenumber",
  "plaintext",
  "prekey",
  "presignedurl",
  "privatekey",
  "publickey",
  "pushendpoint",
  "query",
  "refreshtoken",
  "secret",
  "setcookie",
  "signature",
  "signedprekey",
  "text",
  "token",
  "url",
]);

let processHandlersRegistered = false;

function getServerRootDir(): string {
  return path.join(__dirname, "..", "..", "..");
}

function getLogsDir(): string {
  return path.join(getServerRootDir(), "logs");
}

function getLogFilePath(kind: LogFileKind): string {
  switch (kind) {
    case "request":
      return path.join(getLogsDir(), "requests.log");
    case "error":
      return path.join(getLogsDir(), "errors.log");
    case "app":
    default:
      return path.join(getLogsDir(), "app.log");
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_LOG_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_LOG_STRING_LENGTH - 3)}...`;
}

function normalizeLogKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeLogKey(key);
  if (SAFE_LOG_KEYS.has(normalized)) {
    return false;
  }
  if (SENSITIVE_EXACT_KEYS.has(normalized)) {
    return true;
  }

  return (
    normalized.includes("password") ||
    normalized.includes("passphrase") ||
    normalized.includes("credential") ||
    normalized.includes("bearer") ||
    normalized.includes("accesstoken") ||
    normalized.includes("refreshtoken") ||
    normalized.includes("sessiontoken") ||
    normalized.includes("verificationcode") ||
    normalized.includes("authcode") ||
    normalized.includes("onetimecode") ||
    normalized.includes("privatekey") ||
    normalized.includes("publickey") ||
    normalized.includes("prekey") ||
    normalized.includes("encryptionkey") ||
    normalized.includes("keymaterial") ||
    normalized.includes("objectkey") ||
    normalized.includes("presigned") ||
    normalized.includes("uploadurl") ||
    normalized.includes("downloadurl") ||
    normalized.includes("pushendpoint") ||
    normalized.includes("p256dh") ||
    normalized.includes("coordinate") ||
    normalized.includes("latitude") ||
    normalized.includes("longitude") ||
    normalized.includes("phone") ||
    normalized.includes("contact")
  );
}

function redactSensitiveUrl(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => {
    try {
      const url = new URL(candidate);
      const sensitiveQueryKey = Array.from(url.searchParams.keys()).some(
        (key) =>
          /^(x-amz-|x-goog-|signature$|token$|key$|credential$)/i.test(key),
      );
      return sensitiveQueryKey ? "[redacted-url]" : candidate;
    } catch {
      return candidate;
    }
  });
}

export function sanitizeLogString(value: string): string {
  const withoutUrls = redactSensitiveUrl(value);
  return truncateString(
    withoutUrls
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        REDACTED,
      )
      .replace(
        /\b(password|passphrase|otp|token|secret|authorization|cookie|code)\s*[:=]\s*[^\s,;]+/gi,
        (_match, label: string) => `${label}=${REDACTED}`,
      )
      .replace(/\+?[1-9]\d{9,14}\b/g, REDACTED),
  );
}

type SanitizeOptions = {
  includeErrorStack?: boolean;
};

export function sanitizeLogValue(
  value: unknown,
  options: SanitizeOptions = {},
): JsonValue {
  const seen = new WeakSet<object>();
  const includeErrorStack = options.includeErrorStack ?? !isProductionEnv();

  const visit = (current: unknown): JsonValue => {
    if (current === undefined || current === null) {
      return null;
    }
    if (typeof current === "number" || typeof current === "boolean") {
      return current;
    }
    if (typeof current === "string") {
      return sanitizeLogString(current);
    }
    if (typeof current === "bigint" || typeof current === "symbol") {
      return String(current);
    }
    if (typeof current === "function") {
      return "[function]";
    }

    if (current instanceof Error) {
      const sanitizedError: JsonObject = {
        message: sanitizeLogString(current.message),
        name: current.name,
      };
      if (includeErrorStack && current.stack) {
        sanitizedError["stack"] = sanitizeLogString(current.stack);
      }
      return sanitizedError;
    }

    if (typeof current === "object") {
      if (seen.has(current)) {
        return "[circular]";
      }
      seen.add(current);

      if (Array.isArray(current)) {
        return current.map((item) => visit(item));
      }

      const sanitized: JsonObject = {};
      for (const [key, nestedValue] of Object.entries(current)) {
        sanitized[key] = isSensitiveLogKey(key) ? REDACTED : visit(nestedValue);
      }
      return sanitized;
    }

    return sanitizeLogString(String(current));
  };

  return visit(value);
}

function joinRouteParts(baseUrl: string, routePath: string): string {
  const joined = `${baseUrl}/${routePath}`.replace(/\/+/g, "/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function redactDynamicPathSegments(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment) ||
        /^[0-9a-f]{16,}$/i.test(segment) ||
        /^\+?[1-9]\d{9,14}$/.test(segment) ||
        segment.length > 32
      ) {
        return ":param";
      }
      return segment;
    })
    .join("/");
}

export type SafeRouteRequest = {
  baseUrl?: string;
  originalUrl?: string;
  route?: {
    path?: string | string[];
  };
  url?: string;
};

export function getSafeRoutePath(request: SafeRouteRequest): string {
  const routePath = Array.isArray(request.route?.path)
    ? request.route.path[0]
    : request.route?.path;
  if (routePath) {
    return joinRouteParts(request.baseUrl || "", routePath);
  }

  const rawUrl = request.originalUrl || request.url || "/";
  try {
    return redactDynamicPathSegments(
      new URL(rawUrl, "http://localhost").pathname,
    );
  } catch {
    return "/";
  }
}

function normalizeIpAddress(ipAddress: string): string {
  return ipAddress
    .trim()
    .replace(/^::ffff:/i, "")
    .toLowerCase();
}

export function hashIpAddress(
  ipAddress: string | null | undefined,
  key: string | null | undefined = getLogIpHashKey(),
): string | null {
  if (!ipAddress || !key) {
    return null;
  }
  return createHmac("sha256", key)
    .update(normalizeIpAddress(ipAddress))
    .digest("hex");
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function safeNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildSafeRequestLogMeta(
  input: Partial<SafeRequestLogMeta>,
): SafeRequestLogMeta {
  return {
    requestId: safeString(input.requestId, randomUUID()),
    method: safeString(input.method, "UNKNOWN").toUpperCase(),
    route: safeString(input.route, "/"),
    statusCode: safeNumber(input.statusCode, 0),
    durationMs: Math.max(0, safeNumber(input.durationMs, 0)),
    userID: safeNullableString(input.userID),
    ipHash: safeNullableString(input.ipHash),
    errorCode: safeNullableString(input.errorCode),
  };
}

function getRequestId(request: RequestWithSecurityContext): string {
  const header = request.headers["x-request-id"];
  const candidate = Array.isArray(header) ? header[0] : header;
  if (candidate && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

function getInternalUserId(request: RequestWithSecurityContext): string | null {
  const subject = request.user?.sub ?? request.admin?.sub;
  if (typeof subject !== "string" || subject.length > 128) {
    return null;
  }
  return subject;
}

async function appendLogEntry(entry: LogEntry): Promise<void> {
  await mkdir(getLogsDir(), { mode: 0o700, recursive: true });
  await appendFile(getLogFilePath(entry.kind), `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    flag: "a",
    mode: 0o600,
  });
}

function sanitizeMeta(meta: LogMeta): JsonObject {
  const sanitized = sanitizeLogValue(meta);
  return typeof sanitized === "object" &&
    sanitized !== null &&
    !Array.isArray(sanitized)
    ? sanitized
    : {};
}

export const appLogger = {
  async info(
    context: string,
    message: string,
    meta: LogMeta | null = null,
  ): Promise<void> {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      level: "info",
      kind: "app",
      context: sanitizeLogString(context),
      message: sanitizeLogString(message),
      meta: meta ? sanitizeMeta(meta) : null,
    });
  },

  async request(meta: LogMeta): Promise<void> {
    const safeMeta = buildSafeRequestLogMeta({
      durationMs: meta["durationMs"] as number | undefined,
      errorCode: meta["errorCode"] as string | null | undefined,
      ipHash: meta["ipHash"] as string | null | undefined,
      method: meta["method"] as string | undefined,
      requestId: meta["requestId"] as string | undefined,
      route: meta["route"] as string | undefined,
      statusCode: meta["statusCode"] as number | undefined,
      userID: meta["userID"] as string | null | undefined,
    });
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      level: "info",
      kind: "request",
      context: "http",
      message: `${safeMeta.method} ${safeMeta.route}`,
      meta: sanitizeMeta(safeMeta),
    });
  },

  async error(
    context: string,
    message: string,
    error: unknown,
    meta: LogMeta | null = null,
  ): Promise<void> {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      level: "error",
      kind: "error",
      context: sanitizeLogString(context),
      message: sanitizeLogString(message),
      meta: sanitizeMeta({
        ...(meta ?? {}),
        error,
      }),
    });
  },

  async readRecent(kind: LogFileKind, limit = 30): Promise<LogEntry[]> {
    try {
      const raw = await readFile(getLogFilePath(kind), "utf8");
      return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-Math.max(1, Math.min(limit, 100)))
        .reverse()
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as LogEntry];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  },

  getSummary(): {
    directory: string;
    appFile: string;
    requestFile: string;
    errorFile: string;
  } {
    return {
      directory: getLogsDir(),
      appFile: getLogFilePath("app"),
      requestFile: getLogFilePath("request"),
      errorFile: getLogFilePath("error"),
    };
  },
};

export function createRequestLoggingMiddleware() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const securityRequest = request as RequestWithSecurityContext;
    const startedAt = Date.now();
    const requestId = getRequestId(securityRequest);
    securityRequest.requestId = requestId;
    response.setHeader("X-Request-ID", requestId);

    response.on("finish", () => {
      const locals = response.locals as { errorCode?: unknown };
      void appLogger.request({
        requestId,
        method: securityRequest.method,
        route: getSafeRoutePath(securityRequest),
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        userID: getInternalUserId(securityRequest),
        ipHash: hashIpAddress(
          securityRequest.ip || securityRequest.socket.remoteAddress || null,
        ),
        errorCode: safeNullableString(locals.errorCode),
      });
    });

    next();
  };
}

export function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) {
    return;
  }
  processHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    void appLogger.error("process", "uncaughtException", error);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    void appLogger.error("process", "unhandledRejection", reason);
  });
}
