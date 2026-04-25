import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import type { CustomOrigin } from "@nestjs/common/interfaces/external/cors-options.interface";
import { AppModule } from "./modules/app.module";
import { getCorsOrigins } from "./modules/common/runtime-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.useWebSocketAdapter(new WsAdapter(app));
  const corsOrigins = getCorsOrigins();
  if (corsOrigins.length > 0) {
    const originValidator: CustomOrigin = (
      ...args: [
        origin: string | undefined,
        callback: Parameters<CustomOrigin>[1],
      ]
    ) => {
      const [origin, callback] = args;
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed"), false);
    };

    app.enableCors({
      origin: originValidator,
      credentials: true,
    });
  }
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 8080;
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(
    `API is ready on http://localhost:${port}/api with ${corsOrigins.length} CORS origin(s)`,
  );
}

bootstrap();
