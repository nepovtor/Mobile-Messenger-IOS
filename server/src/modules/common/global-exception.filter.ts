import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { appLogger } from "./app-logger";
import { JsonObject, Throwable } from "./json.types";

type RequestLogContext = {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: JsonObject;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: Throwable, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestLogContext>() ?? {};

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        void appLogger.error("http", "Unhandled HTTP exception", exception, {
          method: request.method,
          url: request.originalUrl || request.url,
          params: request.params,
          query: request.query,
          body: request.body,
          statusCode: status,
        });
      }

      // Ensure response is always JSON object
      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        response.status(status).json(exceptionResponse);
      } else {
        response.status(status).json({
          statusCode: status,
          message: exceptionResponse,
          error: HttpStatus[status],
        });
      }
    } else if (exception instanceof Error) {
      void appLogger.error("http", "Unhandled runtime error", exception, {
        method: request.method,
        url: request.originalUrl || request.url,
        params: request.params,
        query: request.query,
        body: request.body,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal server error",
        error: "Internal Server Error",
      });
    } else {
      void appLogger.error("http", "Unknown runtime error", exception, {
        method: request.method,
        url: request.originalUrl || request.url,
        params: request.params,
        query: request.query,
        body: request.body,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal server error",
        error: "Internal Server Error",
      });
    }
  }
}
