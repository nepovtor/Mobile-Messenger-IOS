import "reflect-metadata";
import { readFileSync } from "node:fs";
import { createTestApp, MockSmsProviderLike } from "./auth-chat-test-harness";
import { SMS_SERVICE } from "../../src/modules/auth/sms/sms.types";
import type { Request, Response, NextFunction } from "express";

// Test-only child process: OTPs are read through IPC, never a network endpoint.
async function main() {
  if (!process.send || !process.env["OIDC_TEST_DATABASE_URL"]) {
    throw new Error("This helper requires the isolated OIDC test runner");
  }
  const bridgeSecret = process.env["OIDC_TEST_SHARED_SECRET_FILE"]
    ? readFileSync(process.env["OIDC_TEST_SHARED_SECRET_FILE"], "utf8").trim()
    : process.env["OIDC_TEST_SHARED_SECRET"];
  const app = await createTestApp({
    postgresUrl: process.env["OIDC_TEST_DATABASE_URL"],
    enableDemoAccounts: false,
    allowTestCode: false,
    authCodeResendCooldownSeconds: 1,
    e2eeRequired: true,
    oidcBridgeEnabled: true,
    oidcBridgeSharedSecret: bridgeSecret,
    beforeInit: (pendingApp) => {
      // Docker reaches the fixture through the host gateway. Expose only the
      // secret-protected bridge boundary, never the ordinary test APIs.
      pendingApp.use(
        (request: Request, response: Response, next: NextFunction) => {
          if (!request.path.startsWith("/api/auth/oidc/")) {
            response.status(404).end();
            return;
          }
          response.on("finish", () => {
            if (response.statusCode >= 400)
              console.error(
                `Isolated OIDC boundary ${request.path}: HTTP ${response.statusCode}`,
              );
          });
          next();
        },
      );
    },
  });
  app.useLogger(false);
  const address = app.getHttpServer().address();
  process.send({ kind: "ready", port: address.port });
  process.on(
    "message",
    (message: { kind: string; phone?: string; id?: number }) => {
      if (message.kind === "otp") {
        const provider = app.get<MockSmsProviderLike>(SMS_SERVICE);
        const entry = provider.sentMessages
          .filter((item) => item.phone === message.phone)
          .at(-1);
        process.send?.({ kind: "otp", id: message.id, code: entry?.code });
      }
    },
  );
  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", close);
  process.on("disconnect", close);
}
void main().catch(() => {
  console.error("Isolated OTP backend failed to start");
  process.exit(1);
});
