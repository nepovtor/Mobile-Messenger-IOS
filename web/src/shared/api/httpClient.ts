import { appConfig } from "@/config/api";
import { adminStorage, storage } from "@/utils/storage";

export class ApiError extends Error {
  status: number;
  code?: string;
  backendMessage: string;
  details?: unknown;

  constructor(message: string, status = 500, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.backendMessage = message;
    this.details = details;
  }
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  authMode?: "user" | "admin" | "none";
};

const unauthorizedHandlers: Partial<
  Record<"user" | "admin", (message: string) => void>
> = {};

export function registerUnauthorizedHandler(
  scope: "user" | "admin",
  handler: (message: string) => void,
) {
  unauthorizedHandlers[scope] = handler;
}

function toApiError(status: number, payload: unknown): ApiError {
  const payloadRecord =
    typeof payload === "object" && payload !== null ? payload : null;
  const code =
    payloadRecord &&
    "code" in payloadRecord &&
    typeof payloadRecord.code === "string"
      ? payloadRecord.code
      : undefined;
  const message =
    payloadRecord &&
    "message" in payloadRecord &&
    typeof payloadRecord.message === "string"
      ? payloadRecord.message
      : status === 401
        ? "Unauthorized"
        : status >= 500
          ? "Backend is unavailable right now. Please try again."
          : "The request could not be completed.";
  const details =
    payloadRecord && "details" in payloadRecord
      ? payloadRecord.details
      : undefined;

  return new ApiError(message, status, code, details);
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      response.status >= 500
        ? "Backend is unavailable right now. Please try again."
        : "Received an invalid server response.",
      response.status,
    );
  }
}

export async function httpRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const {
    timeoutMs = appConfig.requestTimeoutMs,
    authMode = "user",
    headers,
    ...requestInit
  } = options;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token =
      authMode === "admin"
        ? adminStorage.getToken()
        : authMode === "user"
          ? storage.getToken()
          : null;
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...requestInit,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
      signal: controller.signal,
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      const error = toApiError(response.status, payload);
      if (import.meta.env.DEV && response.status >= 500) {
        console.warn("[HTTP] Request failed", {
          path,
          status: response.status,
          code: error.code,
          message: error.message,
          payload,
        });
      }
      if (response.status === 401 && authMode !== "none") {
        unauthorizedHandlers[authMode]?.(error.message);
      }
      throw error;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request timed out. Please try again.", 0);
    }
    throw new ApiError("Network error. Please check your connection.", 0);
  } finally {
    window.clearTimeout(timeout);
  }
}
