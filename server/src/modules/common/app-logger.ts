import { mkdir, readFile, appendFile } from "node:fs/promises";
import * as path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { isJsonObject, JsonObject, JsonValue, Throwable } from "./json.types";

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
  [key: string]: Throwable;
};

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "accessToken",
  "refreshToken",
  "secret",
  "codeHash",
]);

let processHandlersRegistered = false;

function getServerRootDir() {
  return path.join(__dirname, "..", "..", "..");
}

function getLogsDir() {
  return path.join(getServerRootDir(), "logs");
}

function getLogFilePath(kind: LogFileKind) {
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

function truncateString(value: string) {
  if (value.length <= 1000) {
    return value;
  }

  return `${value.slice(0, 997)}...`;
}

function sanitizeLogValue(value: Throwable): JsonValue {
  if (value === undefined) {
    return null;
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: truncateString(value.stack ?? ""),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (typeof value === "object") {
    if (!isJsonObject(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEYS.has(key)
          ? "[redacted]"
          : sanitizeLogValue(nestedValue as Throwable),
      ]),
    ) as JsonObject;
  }

  return String(value);
}

async function appendLogEntry(entry: LogEntry) {
  await mkdir(getLogsDir(), { recursive: true });
  await appendFile(
    getLogFilePath(entry.kind),
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );
}

export const appLogger = {
  async info(context: string, message: string, meta: LogMeta | null = null) {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      level: "info",
      kind: "app",
      context,
      message,
      meta: meta ? (sanitizeLogValue(meta) as JsonObject) : null,
    });
  },

  async request(meta: LogMeta) {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      level: "info",
      kind: "request",
      context: "http",
      message: `${String(meta["method"] ?? "UNKNOWN")} ${String(meta["url"] ?? "/")}`,
      meta: sanitizeLogValue(meta) as JsonObject,
    });
  },

  async error(
    context: string,
    message: string,
    error: Throwable,
    meta: LogMeta | null = null,
  ) {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      level: "error",
      kind: "error",
      context,
      message,
      meta: sanitizeLogValue({
        ...(meta ?? {}),
        error,
      }) as JsonObject,
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
            const parsed = JSON.parse(line) as LogEntry;
            return [parsed];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  },

  getSummary() {
    return {
      directory: getLogsDir(),
      appFile: getLogFilePath("app"),
      requestFile: getLogFilePath("request"),
      errorFile: getLogFilePath("error"),
    };
  },
};

export function createRequestLoggingMiddleware() {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const requestMeta = {
      method: request.method,
      url: request.originalUrl || request.url,
      query: request.query,
      body: request.body,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      hasAuthorizationHeader: Boolean(request.headers.authorization),
    };

    response.on("finish", () => {
      void appLogger.request({
        ...requestMeta,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  };
}

export function registerProcessErrorHandlers() {
  if (processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    void appLogger.error("process", "uncaughtException", error);
  });

  process.on("unhandledRejection", (reason: Throwable) => {
    void appLogger.error("process", "unhandledRejection", reason);
  });
}
