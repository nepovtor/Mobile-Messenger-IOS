import { appConfig } from "../config/api";
import { authStore } from "../store/authStore";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
};

function toApiError(status: number, payload: unknown): ApiError {
  const message =
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message
      : status === 401
        ? "Session expired. Please sign in again."
        : status >= 500
          ? "Backend is unavailable right now. Please try again."
          : "The request could not be completed.";

  return new ApiError(message, status);
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
  const timeoutMs = options.timeoutMs ?? appConfig.requestTimeoutMs;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = authStore.getState().token;
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      const error = toApiError(response.status, payload);
      if (response.status === 401) {
        authStore
          .getState()
          .handleUnauthorized("Session expired. Please sign in again.");
      }
      throw error;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request timed out. Please try again.");
    }
    throw new ApiError("Network error. Please check your connection.");
  } finally {
    window.clearTimeout(timeout);
  }
}
