import { appConfig } from "@/config/api";
import { getLegacyAccessToken } from "@/shared/auth/legacySession";

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
  skipAuthRefresh?: boolean;
};

type AuthScope = Exclude<RequestOptions["authMode"], "none" | undefined>;

const unauthorizedHandlers: Partial<
  Record<AuthScope, (message: string) => void>
> = {};
const refreshRequests: Partial<Record<AuthScope, Promise<boolean>>> = {};

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
    skipAuthRefresh = false,
    headers,
    ...requestInit
  } = options;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }
  requestHeaders.set("X-Client-Platform", "web");
  const legacyAccessToken = authMode === "user" ? getLegacyAccessToken() : null;
  if (legacyAccessToken && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${legacyAccessToken}`);
  }

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...requestInit,
      credentials: "include",
      headers: requestHeaders,
      signal: controller.signal,
    });

    const payload = await parseJson(response);
    if (
      response.status === 401 &&
      authMode !== "none" &&
      !skipAuthRefresh &&
      !legacyAccessToken &&
      (await refreshSession(authMode))
    ) {
      return httpRequest<T>(path, {
        ...options,
        skipAuthRefresh: true,
      });
    }

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

function refreshSession(scope: AuthScope): Promise<boolean> {
  const existingRequest = refreshRequests[scope];
  if (existingRequest) {
    return existingRequest;
  }

  const path = scope === "admin" ? "/admin/refresh" : "/auth/refresh";
  const request = httpRequest<void>(path, {
    method: "POST",
    authMode: "none",
    skipAuthRefresh: true,
  })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      delete refreshRequests[scope];
    });

  refreshRequests[scope] = request;
  return request;
}
