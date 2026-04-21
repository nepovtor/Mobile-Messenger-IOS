import { Logger } from "@nestjs/common";
import * as dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config();

async function bootstrap() {
  const app = await createApp();

  app.enableCors({
    origin: ["http://localhost:4173", "http://127.0.0.1:4173"],
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port);
  Logger.log(`API is ready on http://localhost:${port}/api`, "Bootstrap");
}

void bootstrap();