import { INestApplication, ValidationPipe } from "@nestjs/common";
import type { CustomOrigin } from "@nestjs/common/interfaces/external/cors-options.interface";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import {
  createRequestLoggingMiddleware,
  registerProcessErrorHandlers,
} from "./modules/common/app-logger";
import { GlobalExceptionFilter } from "./modules/common/global-exception.filter";
import {
  getContentSecurityPolicyConnectSources,
  getCorsOrigins,
  isProductionEnv,
  validateRuntimeConfig,
} from "./modules/common/runtime-config";

type ConfigureApplicationOptions = {
  registerProcessHandlers?: boolean;
  requestLogging?: boolean;
};

export function buildHelmetOptions(
  production = isProductionEnv(),
): NonNullable<Parameters<typeof helmet>[0]> {
  return {
    contentSecurityPolicy: {
      directives: {
        baseUri: ["'self'"],
        blockAllMixedContent: production ? [] : null,
        connectSrc: getContentSecurityPolicyConnectSources(),
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    frameguard: {
      action: "deny",
    },
    hsts: production
      ? {
          includeSubDomains: true,
          maxAge: 31_536_000,
          preload: true,
        }
      : false,
    referrerPolicy: {
      policy: "no-referrer",
    },
  };
}

export function configureApplication(
  app: INestApplication,
  options: ConfigureApplicationOptions = {},
): void {
  const corsOrigins = getCorsOrigins();
  const originValidator: CustomOrigin = (
    ...args: [origin: string | undefined, callback: Parameters<CustomOrigin>[1]]
  ) => {
    const [origin, callback] = args;
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS origin is not allowed"), false);
  };

  app.use(helmet(buildHelmetOptions()));
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader(
      "Permissions-Policy",
      "camera=(), display-capture=(), geolocation=(), microphone=(self), payment=(), usb=()",
    );
    next();
  });
  app.enableCors({
    credentials: true,
    methods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    origin: originValidator,
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  if (options.requestLogging !== false) {
    app.use(createRequestLoggingMiddleware());
  }
  if (options.registerProcessHandlers) {
    registerProcessErrorHandlers();
  }

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
}

export async function createApp(
  options: ConfigureApplicationOptions = {},
): Promise<INestApplication> {
  validateRuntimeConfig();
  const { AppModule } = await import("./modules/app.module.js");
  const app = await NestFactory.create(AppModule, { cors: false });
  configureApplication(app, options);
  return app;
}
