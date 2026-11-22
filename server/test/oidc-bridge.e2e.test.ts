import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { getRepositoryToken } from "@nestjs/typeorm";
import { hashSync } from "bcryptjs";
import request from "supertest";
import { FindOptionsWhere, Repository } from "typeorm";
import { AuthSessionEntity } from "../src/entities/auth-session.entity";
import { PhoneVerificationCodeEntity } from "../src/entities/phone-verification-code.entity";
import { SecurityAuditEventEntity } from "../src/entities/security-audit-event.entity";
import {
  AuthMethod,
  UserEntity,
  UserStatus,
} from "../src/entities/user.entity";
import {
  authenticateByCode,
  createTestApp,
} from "./support/auth-chat-test-harness";

const bridgeSecret = randomBytes(32).toString("base64url");
const bridgeOptions = {
  oidcBridgeEnabled: true,
  oidcBridgeSharedSecret: bridgeSecret,
};
const secretHeader = "X-OIDC-Bridge-Secret";
const phoneContext = () => ({
  phone: "+15559000001",
  deviceUuid: randomUUID(),
  ipAddress: "192.0.2.10",
});

test("OIDC bridge is disabled by default even with a configured secret", async (t) => {
  const app = await createTestApp({ oidcBridgeSharedSecret: bridgeSecret });
  t.after(() => app.close());
  for (const route of ["request", "verify", "account"]) {
    await request(app.getHttpServer())
      .post(`/api/auth/oidc/${route}`)
      .set(secretHeader, bridgeSecret)
      .send({})
      .expect(404);
  }
});

test("OIDC bridge fails closed without a canonical 256-bit secret", async (t) => {
  for (const secret of [undefined, "short-secret", "!".repeat(43)]) {
    const app = await createTestApp({
      oidcBridgeEnabled: true,
      oidcBridgeSharedSecret: secret,
    });
    t.after(() => app.close());
    await request(app.getHttpServer())
      .post("/api/auth/oidc/request")
      .set(secretHeader, bridgeSecret)
      .send(phoneContext())
      .expect(404);
  }
});

test("OIDC bridge rejects missing credentials, wrong secret and ordinary user JWT", async (t) => {
  const app = await createTestApp(bridgeOptions);
  t.after(() => app.close());
  const user = await authenticateByCode(app, "+15559000002");
  for (const route of ["request", "verify", "account"]) {
    await request(app.getHttpServer())
      .post(`/api/auth/oidc/${route}`)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/auth/oidc/${route}`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/auth/oidc/${route}`)
      .set(secretHeader, randomBytes(32).toString("base64url"))
      .send({})
      .expect(401);
  }
});

test("OIDC bridge rejects browser origins and fetch metadata", async (t) => {
  const app = await createTestApp(bridgeOptions);
  t.after(() => app.close());
  for (const headers of [
    { Origin: "https://web.example.test" },
    { "Sec-Fetch-Site": "same-origin" },
  ]) {
    await request(app.getHttpServer())
      .post("/api/auth/oidc/request")
      .set(secretHeader, bridgeSecret)
      .set(headers)
      .send(phoneContext())
      .expect(403);
  }
});

test("OIDC OTP returns only stable UUID and authentication time without a Nest session", async (t) => {
  const app = await createTestApp(bridgeOptions);
  t.after(() => app.close());
  const context = phoneContext();
  const users = app.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  const legacyUser = await users.save(
    users.create({
      method: AuthMethod.PHONE,
      contact: context.phone,
      phone: null,
      displayName: "Existing account",
    }),
  );

  const codeResponse = await request(app.getHttpServer())
    .post("/api/auth/oidc/request")
    .set(secretHeader, bridgeSecret)
    .send(context)
    .expect(201);
  assert.deepEqual(Object.keys(codeResponse.body).sort(), [
    "delivery",
    "expiresIn",
    "resendAfterSeconds",
    "status",
  ]);
  assert.equal(codeResponse.headers["cache-control"], "no-store");
  assert.equal(codeResponse.headers["set-cookie"], undefined);

  const before = Math.floor(Date.now() / 1000);
  const verified = await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, code: "123456" })
    .expect(201);
  assert.deepEqual(Object.keys(verified.body).sort(), ["authTime", "subject"]);
  assert.equal(verified.body.subject, legacyUser.id);
  assert.ok(verified.body.authTime >= before);
  assert.ok(verified.body.authTime <= Math.floor(Date.now() / 1000));
  assert.equal(verified.headers["cache-control"], "no-store");
  assert.equal(verified.headers["set-cookie"], undefined);
  assert.equal(await users.countBy({ contact: context.phone }), 1);
  const sessions = app.get<Repository<AuthSessionEntity>>(
    getRepositoryToken(AuthSessionEntity),
  );
  assert.equal(await sessions.count(), 0);
  const auditEvents = app.get<Repository<SecurityAuditEventEntity>>(
    getRepositoryToken(SecurityAuditEventEntity),
  );
  const login = await auditEvents.findOneByOrFail({ actorId: legacyUser.id });
  assert.equal(login.eventType, "auth.user.login");
  assert.equal(login.metadata["authenticationTransport"], "oidc");
  assert.ok(login.ipHash);
  assert.ok(!JSON.stringify(login).includes(context.phone));

  const account = await request(app.getHttpServer())
    .post("/api/auth/oidc/account")
    .set(secretHeader, bridgeSecret)
    .send({ subject: legacyUser.id.toUpperCase() })
    .expect(201);
  assert.deepEqual(account.body, { subject: legacyUser.id });

  // Both entry points use the same atomically consumed OTP record.
  await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, code: "123456" })
    .expect(401);
  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: context.phone, code: "123456" })
    .expect(401);
});

test("OIDC bridge rejects blocked or deactivated users and missing accounts", async (t) => {
  const app = await createTestApp(bridgeOptions);
  t.after(() => app.close());
  const users = app.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  for (const [index, status] of [
    UserStatus.BLOCKED,
    UserStatus.DEACTIVATED,
  ].entries()) {
    const context = { ...phoneContext(), phone: `+1555900001${index}` };
    const user = await users.save(
      users.create({
        method: AuthMethod.PHONE,
        contact: context.phone,
        phone: context.phone,
        displayName: "Inactive account",
        status,
      }),
    );
    await request(app.getHttpServer())
      .post("/api/auth/oidc/request")
      .set(secretHeader, bridgeSecret)
      .send(context)
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/auth/oidc/verify")
      .set(secretHeader, bridgeSecret)
      .send({ ...context, code: "123456" })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/auth/oidc/account")
      .set(secretHeader, bridgeSecret)
      .send({ subject: user.id })
      .expect(401);
  }
  await request(app.getHttpServer())
    .post("/api/auth/oidc/account")
    .set(secretHeader, bridgeSecret)
    .send({ subject: randomUUID() })
    .expect(401);
  const sessions = app.get<Repository<AuthSessionEntity>>(
    getRepositoryToken(AuthSessionEntity),
  );
  assert.equal(await sessions.count(), 0);
});

test("account blocked during identity verification remains blocked in both login transports", async (t) => {
  for (const [useBridge, legacyContact] of [
    [true, false],
    [true, true],
    [false, false],
    [false, true],
  ]) {
    await t.test(
      `${useBridge ? "OIDC identity" : "Nest session"}, ${legacyContact ? "legacy contact" : "phone"}`,
      async (st) => {
        const app = await createTestApp(bridgeOptions);
        st.after(() => app.close());
        const context = phoneContext();
        const users = app.get<Repository<UserEntity>>(
          getRepositoryToken(UserEntity),
        );
        const user = await users.save(
          users.create({
            method: AuthMethod.PHONE,
            contact: context.phone,
            phone: legacyContact ? null : context.phone,
            displayName: "Concurrent block",
          }),
        );
        await request(app.getHttpServer())
          .post("/api/auth/oidc/request")
          .set(secretHeader, bridgeSecret)
          .send(context)
          .expect(201);

        const originalFind = users.findOneBy.bind(users);
        let blockInjected = false;
        st.mock.method(
          users,
          "findOneBy",
          async (
            where:
              | FindOptionsWhere<UserEntity>
              | FindOptionsWhere<UserEntity>[],
          ) => {
            const snapshot = await originalFind(where);
            if (snapshot?.id === user.id && !blockInjected) {
              blockInjected = true;
              await users.update(
                { id: user.id },
                { status: UserStatus.BLOCKED },
              );
            }
            return snapshot;
          },
        );

        const login = request(app.getHttpServer()).post(
          useBridge ? "/api/auth/oidc/verify" : "/api/auth/verify",
        );
        if (useBridge) login.set(secretHeader, bridgeSecret);
        await login
          .send(
            useBridge
              ? { ...context, code: "123456" }
              : { phone: context.phone, code: "123456" },
          )
          .expect(403);
        assert.equal(blockInjected, true);
        assert.equal(
          (await users.findOneByOrFail({ id: user.id })).status,
          UserStatus.BLOCKED,
        );
        const sessions = app.get<Repository<AuthSessionEntity>>(
          getRepositoryToken(AuthSessionEntity),
        );
        assert.equal(await sessions.count(), 0);
      },
    );
  }
});

test("password hash migration preserves a concurrent account block", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(() => app.close());
  const users = app.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  const user = await users.save(
    users.create({
      method: AuthMethod.PHONE,
      contact: "+15559000444",
      phone: "+15559000444",
      login: "concurrent-block",
      passwordHash: hashSync("test-password-strong", 4),
      displayName: "Password migration",
    }),
  );
  const originalUpdate = users.update.bind(users);
  let blockInjected = false;
  t.mock.method(
    users,
    "update",
    async (...args: Parameters<typeof users.update>) => {
      if (args[1].passwordHash && !blockInjected) {
        blockInjected = true;
        await originalUpdate({ id: user.id }, { status: UserStatus.BLOCKED });
      }
      return originalUpdate(...args);
    },
  );
  await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({ login: "concurrent-block", password: "test-password-strong" })
    .expect(401);
  assert.equal(blockInjected, true);
  assert.equal(
    (await users.findOneByOrFail({ id: user.id })).status,
    UserStatus.BLOCKED,
  );
  const sessions = app.get<Repository<AuthSessionEntity>>(
    getRepositoryToken(AuthSessionEntity),
  );
  assert.equal(await sessions.count(), 0);
});

test("OIDC bridge preserves OTP expiry and attempt limits", async (t) => {
  const app = await createTestApp({ ...bridgeOptions, authCodeMaxAttempts: 2 });
  t.after(() => app.close());
  const context = phoneContext();
  await request(app.getHttpServer())
    .post("/api/auth/oidc/request")
    .set(secretHeader, bridgeSecret)
    .send(context)
    .expect(201);
  await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, code: "000000" })
    .expect(401);
  await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, code: "000000" })
    .expect(429);
  await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, code: "123456" })
    .expect(429);
  const expiredContext = { ...context, phone: "+15559000099" };
  await request(app.getHttpServer())
    .post("/api/auth/oidc/request")
    .set(secretHeader, bridgeSecret)
    .send(expiredContext)
    .expect(201);
  const codes = app.get<Repository<PhoneVerificationCodeEntity>>(
    getRepositoryToken(PhoneVerificationCodeEntity),
  );
  await codes.update(
    { phone: expiredContext.phone },
    { expiresAt: new Date(0) },
  );
  await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...expiredContext, code: "123456" })
    .expect(401);
});

test("OIDC bridge validates trusted request context and rejects extra identity claims", async (t) => {
  const app = await createTestApp(bridgeOptions);
  t.after(() => app.close());
  const context = phoneContext();
  for (const body of [
    { ...context, ipAddress: "spoofed" },
    { ...context, deviceUuid: "invalid" },
    { ...context, subject: randomUUID() },
    { phone: context.phone },
  ]) {
    await request(app.getHttpServer())
      .post("/api/auth/oidc/request")
      .set(secretHeader, bridgeSecret)
      .send(body)
      .expect(400);
  }
  await request(app.getHttpServer())
    .post("/api/auth/oidc/account")
    .set(secretHeader, bridgeSecret)
    .send({ subject: context.phone })
    .expect(400);
});

test("OIDC bridge rate limits verified client IP and device across requests", async (t) => {
  const app = await createTestApp({
    ...bridgeOptions,
    authRateLimitMaxRequests: 1,
  });
  t.after(() => app.close());
  const context = phoneContext();
  await request(app.getHttpServer())
    .post("/api/auth/oidc/request")
    .set(secretHeader, bridgeSecret)
    .send(context)
    .expect(201);
  await request(app.getHttpServer())
    .post("/api/auth/oidc/request")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, phone: "+15559000003", deviceUuid: randomUUID() })
    .expect(429);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await request(app.getHttpServer())
      .post("/api/auth/oidc/verify")
      .set(secretHeader, bridgeSecret)
      .send({ ...context, phone: "+15559999999", code: "123456" })
      .expect(401);
  }
  await request(app.getHttpServer())
    .post("/api/auth/oidc/verify")
    .set(secretHeader, bridgeSecret)
    .send({ ...context, code: "123456" })
    .expect(429);
});
