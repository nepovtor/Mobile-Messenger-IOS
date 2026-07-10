import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { Repository } from "typeorm";
import { PhoneVerificationCodeEntity } from "../src/entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../src/entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../src/entities/telegram-pairing-token.entity";
import { AuthMethod, UserEntity } from "../src/entities/user.entity";
import { SMS_SERVICE } from "../src/modules/auth/sms/sms.types";
import { TelegramBotService } from "../src/modules/auth/telegram/telegram-bot.service";
import {
  createTestApp,
  type MockSmsProviderLike,
  type TransportEnvelope,
} from "./support/auth-chat-test-harness";

test("auth endpoints are rate limited", async (t) => {
  const app = await createTestApp({
    allowPasswordLogin: true,
    authRateLimitMaxRequests: 2,
  });
  t.after(async () => {
    await app.close();
  });

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15551230011" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15551230012" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15551230013" })
    .expect(429);
});

test("request code creates hashed verification code and calls SMS mock", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const response = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+375291234567" })
    .expect(201);

  assert.equal(response.body.status, "code_sent");
  assert.equal(response.body.delivery, "mock");
  assert.equal(response.body.resendAfterSeconds, 60);
  assert.equal(response.body.expiresIn, 300);
  assert.equal(response.body.debugCode, "123456");

  const repository = app.get<Repository<PhoneVerificationCodeEntity>>(
    getRepositoryToken(PhoneVerificationCodeEntity),
  );
  const verificationCode = await repository.findOneByOrFail({
    phone: "+375291234567",
  });

  assert.notEqual(verificationCode.codeHash, "123456");
  assert.equal(verificationCode.attempts, 0);
  assert.equal(verificationCode.consumedAt, null);

  const smsProvider = app.get<MockSmsProviderLike>(SMS_SERVICE);
  assert.equal(smsProvider.sentMessages.length, 1);
  assert.deepEqual(smsProvider.sentMessages[0], {
    phone: "+375291234567",
    code: "123456",
  });
});

test("user entity stores phone and telegram auth fields", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  const savedUser = await usersRepository.save(
    usersRepository.create({
      method: AuthMethod.PHONE,
      contact: "+15550001111",
      phone: "+15550001111",
      telegramChatId: "chat-111",
      telegramUsername: "anna_demo",
      displayName: "Anna Entity",
    }),
  );

  const user = await usersRepository.findOneByOrFail({ id: savedUser.id });
  assert.equal(user.phone, "+15550001111");
  assert.equal(user.contact, "+15550001111");
  assert.equal(user.telegramChatId, "chat-111");
  assert.equal(user.telegramUsername, "anna_demo");
  assert.ok(user.updatedAt instanceof Date);
});

test("/auth/request with telegram provider returns TELEGRAM_NOT_LINKED if no link exists", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+375291234567" })
    .expect(400);

  assert.equal(response.body.code, "TELEGRAM_NOT_LINKED");
  assert.match(response.body.message, /Link Telegram in the app first/i);
});

test("Telegram contact update creates TelegramLink with telegramUserId", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);

    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: 777, username: "anna_demo", first_name: "Anna" },
      from: { id: 777, username: "anna_demo", first_name: "Anna" },
      contact: {
        phone_number: "375291234567",
        first_name: "Anna",
        user_id: 777,
      },
    },
  });

  const repository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const link = await repository.findOneByOrFail({ phone: "+375291234567" });

  assert.equal(link.chatId, "777");
  assert.equal(link.telegramUserId, "777");
  assert.equal(link.username, "anna_demo");
  assert.ok(link.lastVerifiedAt instanceof Date);
  assert.equal(sentMessages.length, 1);
});

test("Telegram text phone linking is rejected when TELEGRAM_ALLOW_TEXT_PHONE_LINKING=false", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);

    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 2,
    message: {
      message_id: 11,
      text: "+79991234567",
      chat: { id: 888, username: "boris_demo", first_name: "Boris" },
      from: { id: 888, username: "boris_demo", first_name: "Boris" },
    },
  });

  const repository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const link = await repository.findOneBy({ phone: "+79991234567" });

  assert.equal(link, null);
  assert.match(
    String(sentMessages[0]?.["text"]),
    /Откройте приложение и нажмите/i,
  );
});

test("Telegram text phone linking is allowed only when TELEGRAM_ALLOW_TEXT_PHONE_LINKING=true", async (t) => {
  const app = await createTestApp({
    verificationProvider: "telegram",
    telegramAllowTextPhoneLinking: true,
  });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 2,
    message: {
      message_id: 11,
      text: "+79991234567",
      chat: { id: 888, username: "boris_demo", first_name: "Boris" },
      from: { id: 888, username: "boris_demo", first_name: "Boris" },
    },
  });

  const repository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const link = await repository.findOneByOrFail({ phone: "+79991234567" });

  assert.equal(link.chatId, "888");
  assert.equal(link.telegramUserId, "888");
  assert.equal(link.username, "boris_demo");
});

test("Telegram subscription command sends a mini app offer with plan links", async (t) => {
  const app = await createTestApp({
    verificationProvider: "telegram",
    webAppUrl: "https://web.example.test",
  });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);

    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 2,
    message: {
      message_id: 11,
      text: "/subscription team",
      chat: { id: 888, username: "boris_demo", first_name: "Boris" },
      from: { id: 888, username: "boris_demo", first_name: "Boris" },
    },
  });

  assert.equal(sentMessages.length, 1);
  assert.match(String(sentMessages[0]?.["text"]), /mini app подписки/i);

  const replyMarkup = JSON.parse(String(sentMessages[0]?.["reply_markup"])) as {
    inline_keyboard: Array<Array<TransportEnvelope>>;
  };
  const firstButton = replyMarkup.inline_keyboard[0]?.[0];
  assert.equal(
    (firstButton?.["web_app"] as { url?: string } | undefined)?.url,
    "https://web.example.test/telegram/subscription?source=telegram-bot&plan=team",
  );
});

test("/auth/telegram/pairing creates a hashed token", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const response = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);

  const startToken = new URL(response.body.telegramStartUrl).searchParams.get(
    "start",
  );
  assert.equal(response.body.botUsername, "mobile_messenger_test_bot");
  assert.equal(response.body.expiresIn, 600);
  assert.ok(startToken);

  const repository = app.get<Repository<TelegramPairingTokenEntity>>(
    getRepositoryToken(TelegramPairingTokenEntity),
  );
  const storedToken = await repository.findOneByOrFail({
    phone: "+375291234567",
  });

  assert.notEqual(storedToken.tokenHash, startToken);
  assert.equal(storedToken.consumedAt, null);
});

test("/start <token> accepts a valid pairing token", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 3,
    message: {
      message_id: 12,
      text: `/start ${startToken}`,
      chat: { id: 900, username: "pair_demo", first_name: "Pair" },
      from: { id: 900, username: "pair_demo", first_name: "Pair" },
    },
  });

  const repository = app.get<Repository<TelegramPairingTokenEntity>>(
    getRepositoryToken(TelegramPairingTokenEntity),
  );
  const token = await repository.findOneByOrFail({ phone: "+375291234567" });

  assert.equal(token.chatId, "900");
  assert.equal(token.telegramUserId, "900");
  assert.match(String(sentMessages[0]?.["text"]), /Привязка начата/i);
});

test("expired pairing token is rejected", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const repository = app.get<Repository<TelegramPairingTokenEntity>>(
    getRepositoryToken(TelegramPairingTokenEntity),
  );
  const token = await repository.findOneByOrFail({ phone: "+375291234567" });
  token.expiresAt = new Date(Date.now() - 1_000);
  await repository.save(token);

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 4,
    message: {
      message_id: 13,
      text: `/start ${startToken}`,
      chat: { id: 901, username: "pair_demo", first_name: "Pair" },
      from: { id: 901, username: "pair_demo", first_name: "Pair" },
    },
  });

  const unchangedToken = await repository.findOneByOrFail({
    phone: "+375291234567",
  });
  assert.equal(unchangedToken.chatId, null);
  assert.match(
    String(sentMessages[0]?.["text"]),
    /Срок действия ссылки истёк/i,
  );
});

test("consumed pairing token cannot be reused", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const repository = app.get<Repository<TelegramPairingTokenEntity>>(
    getRepositoryToken(TelegramPairingTokenEntity),
  );
  const token = await repository.findOneByOrFail({ phone: "+375291234567" });
  token.consumedAt = new Date();
  await repository.save(token);

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 5,
    message: {
      message_id: 14,
      text: `/start ${startToken}`,
      chat: { id: 902, username: "pair_demo", first_name: "Pair" },
      from: { id: 902, username: "pair_demo", first_name: "Pair" },
    },
  });

  assert.match(String(sentMessages[0]?.["text"]), /уже использована/i);
});

test("contact from a different user_id is rejected when TELEGRAM_REQUIRE_OWN_CONTACT=true", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 6,
    message: {
      message_id: 15,
      text: `/start ${startToken}`,
      chat: { id: 903, username: "pair_demo", first_name: "Pair" },
      from: { id: 903, username: "pair_demo", first_name: "Pair" },
    },
  });
  await telegramBotService.handleUpdate({
    update_id: 7,
    message: {
      message_id: 16,
      chat: { id: 903, username: "pair_demo", first_name: "Pair" },
      from: { id: 903, username: "pair_demo", first_name: "Pair" },
      contact: {
        phone_number: "375291234567",
        first_name: "Pair",
        user_id: 904,
      },
    },
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const link = await linksRepository.findOneBy({ phone: "+375291234567" });

  assert.equal(link, null);
  assert.match(
    String(sentMessages[sentMessages.length - 1]?.["text"]),
    /Контакт другого пользователя не подходит/i,
  );
});

test("contact without user_id is rejected when TELEGRAM_REQUIRE_OWN_CONTACT=true", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 7,
    message: {
      message_id: 16,
      text: `/start ${startToken}`,
      chat: { id: 903, username: "pair_demo", first_name: "Pair" },
      from: { id: 903, username: "pair_demo", first_name: "Pair" },
    },
  });
  await telegramBotService.handleUpdate({
    update_id: 8,
    message: {
      message_id: 17,
      chat: { id: 903, username: "pair_demo", first_name: "Pair" },
      from: { id: 903, username: "pair_demo", first_name: "Pair" },
      contact: {
        phone_number: "375291234567",
        first_name: "Pair",
      },
    },
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const link = await linksRepository.findOneBy({ phone: "+375291234567" });

  assert.equal(link, null);
  assert.match(
    String(sentMessages[sentMessages.length - 1]?.["text"]),
    /Telegram не подтвердил владельца контакта/i,
  );
});

test("contact phone must match pairing phone", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 8,
    message: {
      message_id: 17,
      text: `/start ${startToken}`,
      chat: { id: 904, username: "pair_demo", first_name: "Pair" },
      from: { id: 904, username: "pair_demo", first_name: "Pair" },
    },
  });
  await telegramBotService.handleUpdate({
    update_id: 9,
    message: {
      message_id: 18,
      chat: { id: 904, username: "pair_demo", first_name: "Pair" },
      from: { id: 904, username: "pair_demo", first_name: "Pair" },
      contact: {
        phone_number: "375291234568",
        first_name: "Pair",
        user_id: 904,
      },
    },
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const pairingTokensRepository = app.get<
    Repository<TelegramPairingTokenEntity>
  >(getRepositoryToken(TelegramPairingTokenEntity));
  const link = await linksRepository.findOneBy({ phone: "+375291234567" });
  const token = await pairingTokensRepository.findOneByOrFail({
    phone: "+375291234567",
  });

  assert.equal(link, null);
  assert.equal(token.attempts, 1);
  assert.equal(token.consumedAt, null);
});

test("secure pairing stores telegramUserId and chatId on TelegramLink", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 10,
    message: {
      message_id: 19,
      text: `/start ${startToken}`,
      chat: { id: 905, username: "pair_demo", first_name: "Pair" },
      from: { id: 905, username: "pair_demo", first_name: "Pair" },
    },
  });
  await telegramBotService.handleUpdate({
    update_id: 11,
    message: {
      message_id: 20,
      chat: { id: 905, username: "pair_demo", first_name: "Pair" },
      from: { id: 905, username: "pair_demo", first_name: "Pair" },
      contact: {
        phone_number: "375291234567",
        first_name: "Pair",
        user_id: 905,
      },
    },
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  const pairingTokensRepository = app.get<
    Repository<TelegramPairingTokenEntity>
  >(getRepositoryToken(TelegramPairingTokenEntity));
  const link = await linksRepository.findOneByOrFail({
    phone: "+375291234567",
  });
  const token = await pairingTokensRepository.findOneByOrFail({
    phone: "+375291234567",
  });

  assert.equal(link.chatId, "905");
  assert.equal(link.telegramUserId, "905");
  assert.ok(link.lastVerifiedAt instanceof Date);
  assert.ok(token.consumedAt instanceof Date);
});

test("relink does not overwrite silently", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  await linksRepository.save(
    linksRepository.create({
      phone: "+375291234567",
      chatId: "old-chat",
      telegramUserId: "700",
      username: "old_user",
      firstName: "Old",
      lastVerifiedAt: new Date(),
      revokedAt: null,
    }),
  );

  const pairingResponse = await request(app.getHttpServer())
    .post("/api/auth/telegram/pairing")
    .send({ phone: "+375291234567" })
    .expect(201);
  const startToken = new URL(
    pairingResponse.body.telegramStartUrl,
  ).searchParams.get("start");
  assert.ok(startToken);

  const originalFetch = globalThis.fetch;
  const sentMessages: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push(body);
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const telegramBotService = app.get(TelegramBotService);
  await telegramBotService.handleUpdate({
    update_id: 12,
    message: {
      message_id: 21,
      text: `/start ${startToken}`,
      chat: { id: 906, username: "new_user", first_name: "New" },
      from: { id: 906, username: "new_user", first_name: "New" },
    },
  });
  await telegramBotService.handleUpdate({
    update_id: 13,
    message: {
      message_id: 22,
      chat: { id: 906, username: "new_user", first_name: "New" },
      from: { id: 906, username: "new_user", first_name: "New" },
      contact: {
        phone_number: "375291234567",
        first_name: "New",
        user_id: 906,
      },
    },
  });

  const unchangedLink = await linksRepository.findOneByOrFail({
    phone: "+375291234567",
  });
  assert.equal(unchangedLink.chatId, "old-chat");
  assert.equal(unchangedLink.telegramUserId, "700");
  assert.match(
    String(sentMessages[sentMessages.length - 1]?.["text"]),
    /Автоперепривязка отключена/i,
  );
});

test("/auth/request sends code when TelegramLink exists", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  const sentBodies: TransportEnvelope[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentBodies.push(body);

    return new Response(JSON.stringify({ ok: true, result: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const linksRepository = app.get<Repository<TelegramLinkEntity>>(
    getRepositoryToken(TelegramLinkEntity),
  );
  await linksRepository.save(
    linksRepository.create({
      phone: "+15557654321",
      chatId: "999",
      telegramUserId: "999",
      username: "vera_demo",
      firstName: "Vera",
      lastVerifiedAt: new Date(),
      revokedAt: null,
    }),
  );

  const response = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15557654321" })
    .expect(201);

  assert.equal(response.body.delivery, "telegram");
  const sendMessagePayload = sentBodies.find(
    (item) => item["chat_id"] === "999",
  );
  assert.ok(sendMessagePayload);
  assert.match(String(sendMessagePayload?.["text"]), /Mobile Messenger/);
  assert.match(String(sendMessagePayload?.["text"]), /123456/);
});

test("console verification works without Telegram bot token", async (t) => {
  const app = await createTestApp({
    verificationProvider: "console",
    telegramBotToken: null,
  });
  t.after(async () => {
    await app.close();
  });

  const healthResponse = await request(app.getHttpServer()).get("/api/health");
  assert.equal(healthResponse.status, 200);

  const response = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15558765432" })
    .expect(201);

  assert.equal(response.body.delivery, "console");
});
