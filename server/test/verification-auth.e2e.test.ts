import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { Repository } from "typeorm";
import { PhoneVerificationCodeEntity } from "../src/entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../src/entities/telegram-link.entity";
import { AuthMethod, UserEntity } from "../src/entities/user.entity";
import {
  authenticateByCode,
  createTestApp,
} from "./support/auth-chat-test-harness";

test("request code respects resend cooldown", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+79991234567" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+79991234567" })
    .expect(429);
});

test("verify with correct code creates new user and returns JWT payload fields", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const requestResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15550123456" })
    .expect(201);

  const verifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      phone: "+15550123456",
      code: requestResponse.body.debugCode,
    })
    .expect(201);

  assert.equal(typeof verifyResponse.body.token, "string");
  assert.equal(verifyResponse.body.phone, "+15550123456");
  assert.equal(verifyResponse.body.displayName, "User 3456");

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  const user = await usersRepository.findOneByOrFail({ phone: "+15550123456" });
  assert.equal(verifyResponse.body.userID, user.id);
});

test("/auth/verify persists telegram link data into user", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  await linksRepository.save(
    linksRepository.create({
      phone: "+15551231234",
      chatId: "12345",
      telegramUserId: "12345",
      username: "linked_user",
      firstName: "Linked",
      lastVerifiedAt: new Date(),
      revokedAt: null,
    }),
  );

  const requestResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15551231234" })
    .expect(201);

  const verifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      phone: "+15551231234",
      code: requestResponse.body.debugCode,
    })
    .expect(201);

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  const user = await usersRepository.findOneByOrFail({
    id: verifyResponse.body.userID,
  });
  assert.equal(user.telegramChatId, "12345");
  assert.equal(user.telegramUsername, "linked_user");
});

test("verify with correct code logs in existing user and preserves userID", async (t) => {
  const app = await createTestApp({ authCodeResendCooldownSeconds: 1 });
  t.after(async () => {
    await app.close();
  });

  const firstAuth = await authenticateByCode(app, "+15559876543");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const secondAuth = await authenticateByCode(app, "+15559876543");

  assert.equal(firstAuth.userID, secondAuth.userID);
  assert.equal(secondAuth.phone, "+15559876543");
});

test("verify reuses legacy contact-only phone user", async (t) => {
  const app = await createTestApp({
    beforeInit: async (pendingApp) => {
      const usersRepository = pendingApp.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );
      await usersRepository.save(
        usersRepository.create({
          method: AuthMethod.PHONE,
          contact: "+15550002222",
          phone: null,
          displayName: "Legacy Contact User",
        }),
      );
    },
  });
  t.after(async () => {
    await app.close();
  });

  const requestResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15550002222" })
    .expect(201);

  const verifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      phone: "+15550002222",
      code: requestResponse.body.debugCode,
    })
    .expect(201);

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  const users = await usersRepository.findBy({ contact: "+15550002222" });
  assert.equal(users.length, 1);
  assert.equal(users[0]?.id, verifyResponse.body.userID);
  assert.equal(users[0]?.phone, "+15550002222");
});

test("verify with wrong code increments attempts", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15557654321" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: "+15557654321", code: "000000" })
    .expect(401);

  const repository = app.get<Repository<PhoneVerificationCodeEntity>>(
    getRepositoryToken(PhoneVerificationCodeEntity),
  );
  const verificationCode = await repository.findOneByOrFail({
    phone: "+15557654321",
  });

  assert.equal(verificationCode.attempts, 1);
});

test("expired code is rejected", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15553456789" })
    .expect(201);

  const repository = app.get<Repository<PhoneVerificationCodeEntity>>(
    getRepositoryToken(PhoneVerificationCodeEntity),
  );
  const verificationCode = await repository.findOneByOrFail({
    phone: "+15553456789",
  });
  verificationCode.expiresAt = new Date(Date.now() - 1_000);
  await repository.save(verificationCode);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: "+15553456789", code: "123456" })
    .expect(401);
});

test("consumed code cannot be reused", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const firstVerifyResponse = await authenticateByCode(app, "+15554561234");

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: "+15554561234", code: "123456" })
    .expect(401);

  assert.equal(typeof firstVerifyResponse.token, "string");
});

test("too many attempts are rejected", async (t) => {
  const app = await createTestApp({ authCodeMaxAttempts: 3 });
  t.after(async () => {
    await app.close();
  });

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15552345678" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: "+15552345678", code: "000000" })
    .expect(401);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: "+15552345678", code: "000000" })
    .expect(401);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({ phone: "+15552345678", code: "000000" })
    .expect(429);
});

test("demo account still works when enabled", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const response = await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({
      method: "phone",
      contact: "+15551230011",
      password: "demo1111",
    })
    .expect(201);

  assert.equal(response.body.displayName, "Анна Demo");
  assert.equal(response.body.phone, "+15551230011");
});

test("demo account bootstrap reuses legacy contact-only users during startup", async (t) => {
  const app = await createTestApp({
    allowPasswordLogin: true,
    enableDemoChatSeeding: true,
    beforeInit: async (pendingApp) => {
      const usersRepository = pendingApp.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );
      await usersRepository.save(
        usersRepository.create({
          method: AuthMethod.PHONE,
          contact: "+15551230011",
          phone: null,
          displayName: "Legacy Анна",
        }),
      );
    },
  });
  t.after(async () => {
    await app.close();
  });

  const response = await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({
      method: "phone",
      contact: "+15551230011",
      password: "demo1111",
    })
    .expect(201);

  assert.equal(response.body.displayName, "Анна Demo");
  assert.equal(response.body.phone, "+15551230011");

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  const users = await usersRepository.findBy({ contact: "+15551230011" });
  assert.equal(users.length, 1);
  assert.equal(users[0]?.phone, "+15551230011");
});

test("demo account is disabled when AUTH_ENABLE_DEMO_ACCOUNTS=false", async (t) => {
  const app = await createTestApp({
    allowPasswordLogin: true,
    enableDemoAccounts: false,
  });
  t.after(async () => {
    await app.close();
  });

  await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({
      method: "phone",
      contact: "+15551230011",
      password: "demo1111",
    })
    .expect(403);
});
