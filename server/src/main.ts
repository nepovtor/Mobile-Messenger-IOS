import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./modules/app.module";
import { getCorsOrigins } from "./modules/common/runtime-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const corsOrigins = getCorsOrigins();
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS origin is not allowed"), false);
      },
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
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `API is ready on http://localhost:${port}/api with ${corsOrigins.length} CORS origin(s)`,
  );
}

bootstrap();
