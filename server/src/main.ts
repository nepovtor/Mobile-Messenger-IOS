import "dotenv/config";
import { createApp } from "./app";
import { appLogger } from "./modules/common/app-logger";
import { getCorsOrigins } from "./modules/common/runtime-config";

async function bootstrap(): Promise<void> {
  const app = await createApp({
    registerProcessHandlers: true,
    requestLogging: true,
  });
  const port = process.env["PORT"] ? Number(process.env["PORT"]) : 8080;
  await app.listen(port, "0.0.0.0");
  await appLogger.info("bootstrap", "API server started", {
    corsOriginCount: getCorsOrigins().length,
    port,
  });
}

void bootstrap().catch(async (error: unknown) => {
  try {
    await appLogger.error("bootstrap", "API server failed to start", error);
  } finally {
    process.exitCode = 1;
  }
});
