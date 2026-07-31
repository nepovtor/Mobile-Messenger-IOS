import assert from "node:assert/strict";
import test from "node:test";
import { Controller, Get, INestApplication, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApplication } from "../src/app";

@Controller("probe")
class SecurityHeadersProbeController {
  @Get()
  getProbe(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [SecurityHeadersProbeController],
})
class SecurityHeadersProbeModule {}

async function withEnv(
  updates: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function createSecurityHeadersApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [SecurityHeadersProbeModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApplication(app, {
    requestLogging: false,
  });
  await app.init();
  return app;
}

test("production responses include strict browser security headers", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.example.test",
      WS_ORIGINS: "https://app.example.test",
    },
    async () => {
      const app = await createSecurityHeadersApp();
      try {
        const response = await request(app.getHttpServer())
          .get("/api/probe")
          .set("Origin", "https://app.example.test");

        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { ok: true });
        assert.equal(
          response.headers["access-control-allow-origin"],
          "https://app.example.test",
        );
        assert.equal(
          response.headers["access-control-allow-credentials"],
          "true",
        );
        assert.equal(response.headers["x-content-type-options"], "nosniff");
        assert.equal(response.headers["x-frame-options"], "DENY");
        assert.equal(response.headers["referrer-policy"], "no-referrer");
        assert.match(
          String(response.headers["strict-transport-security"]),
          /max-age=31536000/i,
        );
        assert.match(
          String(response.headers["strict-transport-security"]),
          /includeSubDomains/i,
        );
        assert.match(
          String(response.headers["permissions-policy"]),
          /geolocation=\(\)/,
        );

        const csp = String(response.headers["content-security-policy"]);
        assert.match(csp, /default-src 'self'/);
        assert.match(csp, /frame-ancestors 'none'/);
        assert.match(csp, /object-src 'none'/);
        assert.match(csp, /block-all-mixed-content/);
        assert.match(csp, /upgrade-insecure-requests/);
        assert.match(csp, /https:\/\/app\.example\.test/);
        assert.match(csp, /wss:\/\/app\.example\.test/);
      } finally {
        await app.close();
      }
    },
  );
});

test("credentialed CORS is exact-origin and rejects unlisted browsers", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.example.test",
      WS_ORIGINS: "https://realtime.example.test",
    },
    async () => {
      const app = await createSecurityHeadersApp();
      try {
        const allowed = await request(app.getHttpServer())
          .options("/api/probe")
          .set("Origin", "https://app.example.test")
          .set("Access-Control-Request-Method", "GET");
        assert.equal(allowed.status, 204);
        assert.equal(
          allowed.headers["access-control-allow-origin"],
          "https://app.example.test",
        );
        assert.equal(
          allowed.headers["access-control-allow-credentials"],
          "true",
        );

        const denied = await request(app.getHttpServer())
          .options("/api/probe")
          .set("Origin", "https://evil.example.test")
          .set("Access-Control-Request-Method", "GET");
        assert.ok(denied.status >= 400);
        assert.equal(denied.headers["access-control-allow-origin"], undefined);

        const nativeClient = await request(app.getHttpServer()).get(
          "/api/probe",
        );
        assert.equal(nativeClient.status, 200);
        assert.equal(
          nativeClient.headers["access-control-allow-origin"],
          undefined,
        );
      } finally {
        await app.close();
      }
    },
  );
});
