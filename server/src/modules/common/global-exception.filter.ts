import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { appLogger, getSafeRoutePath } from "./app-logger";

type RequestWithLogContext = Request & {
  requestId?: string;
};

type ErrorResponseBody = {
  code?: unknown;
  error?: unknown;
};

function normalizeErrorCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized && normalized.length <= 80 ? normalized : null;
}

export function getExceptionErrorCode(
  exceptionResponse: unknown,
  status: number,
): string {
  if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
    const body = exceptionResponse as ErrorResponseBody;
    const explicitCode =
      normalizeErrorCode(body.code) ?? normalizeErrorCode(body.error);
    if (explicitCode) {
      return explicitCode;
    }
  }
  return `HTTP_${status}`;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithLogContext>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const errorCode = getExceptionErrorCode(exceptionResponse, status);
      (response.locals as { errorCode?: string }).errorCode = errorCode;

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        void appLogger.error("http", "Unhandled HTTP exception", exception, {
          requestId: request.requestId ?? null,
          method: request.method,
          route: getSafeRoutePath(request),
          statusCode: status,
          errorCode,
        });
      }

      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        response.status(status).json(exceptionResponse);
      } else {
        response.status(status).json({
          statusCode: status,
          message: exceptionResponse,
          error: HttpStatus[status],
        });
      }
      return;
    }

    const errorCode = "INTERNAL_SERVER_ERROR";
    (response.locals as { errorCode?: string }).errorCode = errorCode;
    void appLogger.error(
      "http",
      exception instanceof Error
        ? "Unhandled runtime error"
        : "Unknown runtime error",
      exception,
      {
        requestId: request.requestId ?? null,
        method: request.method,
        route: getSafeRoutePath(request),
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode,
      },
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      error: "Internal Server Error",
    });
  }
}
