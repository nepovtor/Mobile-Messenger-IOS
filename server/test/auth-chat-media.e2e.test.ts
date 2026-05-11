import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { WsAdapter } from "@nestjs/platform-ws";
import { Test } from "@nestjs/testing";
import { getRepositoryToken, TypeOrmModule } from "@nestjs/typeorm";
import { DataType, newDb } from "pg-mem";
import request from "supertest";
import { Repository } from "typeorm";
import { WebSocket } from "ws";
import { ChatEntity } from "../src/entities/chat.entity";
import { ChatParticipantEntity } from "../src/entities/chat-participant.entity";
import { ContactEntity } from "../src/entities/contact.entity";
import { MediaEntity, MediaStatus } from "../src/entities/media.entity";
import { MessageEntity } from "../src/entities/message.entity";
import { PhoneVerificationCodeEntity } from "../src/entities/phone-verification-code.entity";
import { PushSubscriptionEntity } from "../src/entities/push-subscription.entity";
import { TelegramLinkEntity } from "../src/entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../src/entities/telegram-pairing-token.entity";
import { AuthMethod, UserEntity } from "../src/entities/user.entity";
import { AuthModule } from "../src/modules/auth/auth.module";
import { ChatModule } from "../src/modules/chat/chat.module";
import { MediaModule } from "../src/modules/media/media.module";
import { MediaService } from "../src/modules/media/media.service";
import { RealtimeModule } from "../src/modules/realtime/realtime.module";
import { HealthModule } from "../src/modules/health/health.module";
import { SMS_SERVICE, SmsService } from "../src/modules/auth/sms/sms.types";
import { TelegramBotService } from "../src/modules/auth/telegram/telegram-bot.service";

class FakeMediaService {
  private readonly media = new Map<string, MediaEntity>();

  async createUploadUrl(
    userID: string,
    dto: {
      mimeType: string;
      sizeBytes: number;
      width?: number;
      height?: number;
    },
  ): Promise<{ mediaID: string; uploadURL: string; objectKey: string }> {
    const media = Object.assign(new MediaEntity(), {
      id: randomUUID(),
      objectKey: `uploads/${userID}/${randomUUID()}`,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      width: dto.width ?? null,
      height: dto.height ?? null,
      uploadedById: userID,
      status: MediaStatus.PENDING,
      createdAt: new Date(),
    });

    this.media.set(media.id, media);
    return {
      mediaID: media.id,
      uploadURL: `https://uploads.example.test/${media.id}`,
      objectKey: media.objectKey,
    };
  }

  async confirmUpload(mediaID: string, userID: string): Promise<MediaEntity> {
    const media = this.requireMedia(mediaID);
    if (media.uploadedById !== userID) {
      throw new BadRequestException("Media belongs to another user");
    }

    media.status = MediaStatus.UPLOADED;
    this.media.set(media.id, media);
    return media;
  }

  async getUploadedMediaOrFail(mediaID: string): Promise<MediaEntity> {
    const media = this.requireMedia(mediaID);
    if (media.status !== MediaStatus.UPLOADED) {
      throw new BadRequestException("Media upload is not confirmed");
    }
    return media;
  }

  async buildDownloadUrl(media: MediaEntity | null): Promise<string | null> {
    if (!media || media.status !== MediaStatus.UPLOADED) {
      return null;
    }

    return `https://cdn.example.test/${media.objectKey}`;
  }

  private requireMedia(mediaID: string): MediaEntity {
    const media = this.media.get(mediaID);
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    return media;
  }
}

type TestAppOptions = {
  allowPasswordLogin?: boolean;
  authRateLimitMaxRequests?: number;
  enableDemoAccounts?: boolean;
  enableDemoChatSeeding?: boolean;
  allowTestCode?: boolean;
  authCodeTTLSeconds?: number;
  authCodeMaxAttempts?: number;
  authCodeResendCooldownSeconds?: number;
  verificationProvider?: "mock" | "console" | "telegram" | "sms";
  smsProvider?: "mock" | "console";
  telegramBotToken?: string | null;
  telegramAllowTextPhoneLinking?: boolean;
  telegramRequireOwnContact?: boolean;
  telegramPairingTokenTTLSeconds?: number;
  telegramLinkResendCooldownSeconds?: number;
  telegramAllowRelink?: boolean;
  webAppUrl?: string | null;
  beforeInit?: (app: INestApplication) => Promise<void> | void;
};

async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.JWT_EXPIRES_IN = "7d";
  process.env.DB_SYNCHRONIZE = "true";
  process.env.AUTH_ENABLE_DEMO_ACCOUNTS =
    options.enableDemoAccounts === false ? "false" : "true";
  process.env.AUTH_ALLOW_PASSWORD_LOGIN = options.allowPasswordLogin
    ? "true"
    : "false";
  process.env.AUTH_ALLOW_TEST_CODE =
    options.allowTestCode === false ? "false" : "true";
  process.env.AUTH_TEST_CODE = "123456";
  process.env.AUTH_CODE_TTL_SECONDS = String(options.authCodeTTLSeconds ?? 300);
  process.env.AUTH_CODE_MAX_ATTEMPTS = String(options.authCodeMaxAttempts ?? 5);
  process.env.AUTH_CODE_RESEND_COOLDOWN_SECONDS = String(
    options.authCodeResendCooldownSeconds ?? 60,
  );
  process.env.CHAT_ENABLE_DEMO_SEEDING = options.enableDemoChatSeeding
    ? "true"
    : "false";
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = String(
    options.authRateLimitMaxRequests ?? 20,
  );
  process.env.VERIFICATION_PROVIDER = options.verificationProvider ?? "mock";
  process.env.SMS_PROVIDER = options.smsProvider ?? "mock";
  if (options.telegramBotToken === null) {
    delete process.env.TELEGRAM_BOT_TOKEN;
  } else {
    process.env.TELEGRAM_BOT_TOKEN =
      options.telegramBotToken ?? "test-telegram-token";
  }
  process.env.TELEGRAM_BOT_USERNAME = "mobile_messenger_test_bot";
  process.env.TELEGRAM_ALLOW_TEXT_PHONE_LINKING =
    options.telegramAllowTextPhoneLinking ? "true" : "false";
  process.env.TELEGRAM_REQUIRE_OWN_CONTACT =
    options.telegramRequireOwnContact === false ? "false" : "true";
  process.env.TELEGRAM_PAIRING_TOKEN_TTL_SECONDS = String(
    options.telegramPairingTokenTTLSeconds ?? 600,
  );
  process.env.TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS = String(
    options.telegramLinkResendCooldownSeconds ?? 60,
  );
  process.env.TELEGRAM_ALLOW_RELINK = options.telegramAllowRelink
    ? "true"
    : "false";
  if (options.webAppUrl === null) {
    delete process.env.WEB_APP_URL;
  } else {
    process.env.WEB_APP_URL = options.webAppUrl ?? "https://web.example.test";
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRootAsync({
        useFactory: async () => ({
          type: "postgres",
          entities: [
            UserEntity,
            ContactEntity,
            PhoneVerificationCodeEntity,
            TelegramLinkEntity,
            TelegramPairingTokenEntity,
            ChatEntity,
            ChatParticipantEntity,
            MessageEntity,
            MediaEntity,
            PushSubscriptionEntity,
          ],
          synchronize: true,
        }),
        dataSourceFactory: async (options) => {
          const database = newDb({
            autoCreateForeignKeyIndices: true,
          });
          database.public.registerFunction({
            name: "current_database",
            returns: DataType.text,
            implementation: () => "pg_mem",
          });
          database.public.registerFunction({
            name: "version",
            returns: DataType.text,
            implementation: () => "pg-mem",
          });

          const dataSource =
            await database.adapters.createTypeormDataSource(options);
          return dataSource.initialize();
        },
      }),
      RealtimeModule,
      AuthModule,
      HealthModule,
      MediaModule,
      ChatModule,
    ],
  })
    .overrideProvider(MediaService)
    .useValue(new FakeMediaService())
    .compile();

  const app = moduleRef.createNestApplication();
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await options.beforeInit?.(app);
  await app.init();
  await app.listen(0);
  return app;
}

function realtimeURL(app: INestApplication): string {
  const address = app.getHttpServer().address();
  const port = typeof address === "string" ? 80 : address?.port;
  return `ws://127.0.0.1:${port}/realtime`;
}

type SocketEvent<TData = unknown> = {
  event: string;
  data: TData;
};

type MockSmsProviderLike = SmsService & {
  sentMessages: Array<{ phone: string; code: string }>;
};

async function openRealtimeSocket(
  app: INestApplication,
  token: string,
): Promise<{
  socket: WebSocket;
  nextEvent: <TData = unknown>(
    eventName: string,
  ) => Promise<SocketEvent<TData>>;
}> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(realtimeURL(app), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const queue: SocketEvent[] = [];
    const waiters = new Map<string, Array<(event: SocketEvent) => void>>();

    socket.on("message", (raw: Buffer) => {
      const parsed = JSON.parse(raw.toString()) as SocketEvent;
      const waiting = waiters.get(parsed.event);
      if (waiting?.length) {
        const resolveNext = waiting.shift();
        if (resolveNext) {
          resolveNext(parsed);
        }
        if (waiting.length === 0) {
          waiters.delete(parsed.event);
        }
        return;
      }
      queue.push(parsed);
    });

    const cleanup = () => {
      socket.removeAllListeners("open");
      socket.removeAllListeners("error");
    };

    socket.once("open", () => {
      cleanup();
      resolve({
        socket,
        nextEvent: async <TData = unknown>(eventName: string) => {
          const queuedIndex = queue.findIndex(
            (item) => item.event === eventName,
          );
          if (queuedIndex >= 0) {
            return queue.splice(queuedIndex, 1)[0] as SocketEvent<TData>;
          }

          return new Promise<SocketEvent<TData>>(
            (resolveEvent, rejectEvent) => {
              const timeout = setTimeout(() => {
                const pending = waiters.get(eventName) ?? [];
                waiters.set(
                  eventName,
                  pending.filter((callback) => callback !== wrappedResolve),
                );
                rejectEvent(new Error(`Timed out waiting for ${eventName}`));
              }, 2000);

              const wrappedResolve = (event: SocketEvent) => {
                clearTimeout(timeout);
                resolveEvent(event as SocketEvent<TData>);
              };

              const pending = waiters.get(eventName) ?? [];
              pending.push(wrappedResolve);
              waiters.set(eventName, pending);
            },
          );
        },
      });
    });
    socket.once("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

function sendRealtimeEvent(
  socket: WebSocket,
  event: string,
  data: Record<string, unknown>,
): void {
  socket.send(JSON.stringify({ event, data }));
}

async function authenticateByCode(
  app: INestApplication,
  contact: string,
): Promise<{
  token: string;
  userID: string;
  displayName: string;
  phone: string;
}> {
  const requestCodeResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: contact })
    .expect(201);

  assert.equal(typeof requestCodeResponse.body.debugCode, "string");
  assert.equal(requestCodeResponse.body.status, "code_sent");
  assert.equal(requestCodeResponse.body.delivery, "mock");
  assert.equal(typeof requestCodeResponse.body.resendAfterSeconds, "number");

  const verifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      phone: contact,
      code: requestCodeResponse.body.debugCode,
    })
    .expect(201);

  return verifyResponse.body;
}

test("auth, direct-chat dedupe, search and media flow work end-to-end", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const firstChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const repeatedChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  assert.equal(repeatedChatResponse.body.id, firstChatResponse.body.id);

  const chatID = firstChatResponse.body.id as string;
  const textMessageID = randomUUID();

  const textMessageResponse = await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: textMessageID,
      kind: "text",
      text: "Привет, Борис!",
    })
    .expect(201);

  assert.equal(textMessageResponse.body.messageID, textMessageID);
  assert.equal(textMessageResponse.body.status, "delivered");

  const uploadResponse = await request(app.getHttpServer())
    .post("/api/media/upload-url")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      width: 400,
      height: 300,
    })
    .expect(201);

  const confirmUploadResponse = await request(app.getHttpServer())
    .post(`/api/media/${uploadResponse.body.mediaID}/confirm`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({ etag: "test-etag" })
    .expect(201);

  assert.equal(confirmUploadResponse.body.status, "uploaded");

  const titleSearchResponse = await request(app.getHttpServer())
    .get("/api/chats")
    .query({ search: "борис" })
    .set("Authorization", `Bearer ${anna.token}`)
    .expect(200);

  assert.equal(titleSearchResponse.body.length, 1);
  assert.equal(titleSearchResponse.body[0].id, chatID);

  const previewSearchResponse = await request(app.getHttpServer())
    .get("/api/chats")
    .query({ search: "Привет" })
    .set("Authorization", `Bearer ${anna.token}`)
    .expect(200);

  assert.equal(previewSearchResponse.body.length, 1);
  assert.equal(previewSearchResponse.body[0].id, chatID);

  const messagesResponse = await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(messagesResponse.body.length, 1);
  assert.equal(messagesResponse.body[0].text, "Привет, Борис!");
});

test("password login is disabled when the feature flag is off", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: false });
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

test("verification codes are single-use and auth/me returns the current user", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const requestCodeResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ phone: "+15551230011" })
    .expect(201);

  const debugCode = requestCodeResponse.body.debugCode as string;
  assert.equal(typeof debugCode, "string");

  const firstVerifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      phone: "+15551230011",
      code: debugCode,
    })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      phone: "+15551230011",
      code: debugCode,
    })
    .expect(401);

  const meResponse = await request(app.getHttpServer())
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${firstVerifyResponse.body.token}`)
    .expect(200);

  assert.equal(meResponse.body.userID, firstVerifyResponse.body.userID);
  assert.equal(meResponse.body.contact, "+15551230011");
});

test("chat unread counters drop after mark-read and paginated history stays ordered", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const firstClientMessageID = randomUUID();
  const secondClientMessageID = randomUUID();

  const firstMessageResponse = await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: firstClientMessageID,
      kind: "text",
      text: "Первое сообщение",
    })
    .expect(201);

  const secondMessageResponse = await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: secondClientMessageID,
      kind: "text",
      text: "Второе сообщение",
    })
    .expect(201);

  const unreadBeforeRead = await request(app.getHttpServer())
    .get("/api/chats")
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(unreadBeforeRead.body.length, 1);
  assert.equal(unreadBeforeRead.body[0].unreadCount, 2);

  const pagedHistory = await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .query({ limit: 2, before: secondMessageResponse.body.id })
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(pagedHistory.body.length, 1);
  assert.equal(pagedHistory.body[0].id, firstMessageResponse.body.id);
  assert.equal(pagedHistory.body[0].text, "Первое сообщение");

  await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages/${secondMessageResponse.body.id}/read`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(201);

  const unreadAfterRead = await request(app.getHttpServer())
    .get("/api/chats")
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(unreadAfterRead.body.length, 1);
  assert.equal(unreadAfterRead.body[0].unreadCount, 0);

  const updatedMessages = await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(updatedMessages.body.length, 2);
  assert.equal(updatedMessages.body[0].status, "read");
  assert.equal(updatedMessages.body[1].status, "read");
});

test("chat deletion hides it for the current user and restores it on new activity", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const borisClient = await openRealtimeSocket(app, boris.token);
  t.after(() => {
    borisClient.socket.close();
  });
  await borisClient.nextEvent("connection.ready");

  await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Первое непрочитанное сообщение",
    })
    .expect(201);

  const borisBeforeDelete = await request(app.getHttpServer())
    .get("/api/chats")
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(borisBeforeDelete.body.length, 1);
  assert.equal(borisBeforeDelete.body[0].unreadCount, 1);

  const deleteResponse = await request(app.getHttpServer())
    .delete(`/api/chats/${chatID}`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(deleteResponse.body.ok, true);
  assert.equal(deleteResponse.body.chatID, chatID);

  const deletedEvent = await borisClient.nextEvent<{ chatID: string }>(
    "chat.deleted",
  );
  assert.equal(deletedEvent.data.chatID, chatID);

  const borisAfterDelete = await request(app.getHttpServer())
    .get("/api/chats")
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(borisAfterDelete.body.length, 0);

  const annaAfterDelete = await request(app.getHttpServer())
    .get("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .expect(200);

  assert.equal(annaAfterDelete.body.length, 1);
  assert.equal(annaAfterDelete.body[0].id, chatID);

  await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Новое сообщение после удаления чата",
    })
    .expect(201);

  const restoredEvent = await borisClient.nextEvent<{
    chatID: string;
    chat: { id: string; title: string; unreadCount: number };
  }>("chat.created");
  assert.equal(restoredEvent.data.chatID, chatID);
  assert.equal(restoredEvent.data.chat.id, chatID);
  assert.equal(restoredEvent.data.chat.title, anna.displayName);
  assert.equal(restoredEvent.data.chat.unreadCount, 1);

  const borisRestoredChats = await request(app.getHttpServer())
    .get("/api/chats")
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(borisRestoredChats.body.length, 1);
  assert.equal(borisRestoredChats.body[0].id, chatID);
  assert.equal(borisRestoredChats.body[0].unreadCount, 1);
});

test("valid token can connect to realtime websocket", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const client = await openRealtimeSocket(app, anna.token);
  t.after(() => {
    client.socket.close();
  });

  const ready = await client.nextEvent<{
    userID: string;
  }>("connection.ready");
  assert.equal(ready.data.userID, anna.userID);
});

test("valid token can connect to realtime websocket via query token", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");

  const ready = await new Promise<{ userID: string }>((resolve, reject) => {
    const url = new URL(realtimeURL(app));
    url.searchParams.set("token", anna.token);

    const socket = new WebSocket(url);
    t.after(() => {
      socket.close();
    });

    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for connection.ready")),
      2000,
    );

    socket.once("message", (raw: Buffer) => {
      clearTimeout(timeout);
      const event = JSON.parse(raw.toString()) as SocketEvent<{
        userID: string;
      }>;
      resolve(event.data);
    });

    socket.once("error", reject);
  });

  assert.equal(ready.userID, anna.userID);
});

test("invalid token is rejected by realtime websocket", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const closeCode = await new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(realtimeURL(app), {
      headers: {
        Authorization: "Bearer invalid-token",
      },
    });

    socket.once("close", (code) => resolve(code));
    socket.once("error", () => {
      // close event is the assertion source here
    });
    setTimeout(() => reject(new Error("Socket was not closed")), 2000);
  });

  assert.equal(closeCode, 4001);
});

test("invalid query token is rejected by realtime websocket", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const closeCode = await new Promise<number>((resolve, reject) => {
    const url = new URL(realtimeURL(app));
    url.searchParams.set("token", "invalid-token");

    const socket = new WebSocket(url);

    socket.once("close", (code) => resolve(code));
    socket.once("error", () => {
      // close event is the assertion source here
    });
    setTimeout(() => reject(new Error("Socket was not closed")), 2000);
  });

  assert.equal(closeCode, 4001);
});

test("missing token is rejected by realtime websocket", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const closeCode = await new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(realtimeURL(app));

    socket.once("close", (code) => resolve(code));
    socket.once("error", () => {
      // close event is the assertion source here
    });
    setTimeout(() => reject(new Error("Socket was not closed")), 2000);
  });

  assert.equal(closeCode, 4001);
});

test("expired token is rejected by REST and realtime websocket", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const jwtService = app.get(JwtService);
  const expiredToken = await jwtService.signAsync(
    {
      sub: anna.userID,
      displayName: anna.displayName,
    },
    {
      secret: process.env.JWT_SECRET,
      expiresIn: -1,
    },
  );

  await request(app.getHttpServer())
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${expiredToken}`)
    .expect(401);

  const closeCode = await new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(realtimeURL(app), {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    socket.once("close", (code) => resolve(code));
    socket.once("error", () => {
      // close event is the assertion source here
    });
    setTimeout(() => reject(new Error("Socket was not closed")), 2000);
  });

  assert.equal(closeCode, 4001);
});

test("participant can send message and receive ack plus broadcast", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const clientMessageId = randomUUID();
  const annaClient = await openRealtimeSocket(app, anna.token);
  const borisClient = await openRealtimeSocket(app, boris.token);
  t.after(() => {
    annaClient.socket.close();
    borisClient.socket.close();
  });

  await annaClient.nextEvent("connection.ready");
  await borisClient.nextEvent("connection.ready");

  sendRealtimeEvent(annaClient.socket, "message.send", {
    chatID,
    clientMessageId,
    kind: "text",
    text: "Привет по ws",
  });

  const ack = await annaClient.nextEvent<{
    clientMessageId: string;
    message: { text: string };
  }>("message.send.ack");
  const broadcast = await borisClient.nextEvent<{
    chatID: string;
    message: { text: string };
  }>("message.created");

  assert.equal(ack.data.clientMessageId, clientMessageId);
  assert.equal(ack.data.message.text, "Привет по ws");
  assert.equal(broadcast.data.message.text, "Привет по ws");
  assert.equal(broadcast.data.chatID, chatID);
});

test("non-participant cannot send message over realtime websocket", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  await authenticateByCode(app, "+15551230012");
  const vera = await authenticateByCode(app, "+15551230013");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const veraClient = await openRealtimeSocket(app, vera.token);
  t.after(() => {
    veraClient.socket.close();
  });

  await veraClient.nextEvent("connection.ready");

  sendRealtimeEvent(veraClient.socket, "message.send", {
    chatID,
    clientMessageId: randomUUID(),
    kind: "text",
    text: "Я не участник",
  });

  const failed = await veraClient.nextEvent<{ reason: string }>(
    "message.failed",
  );
  assert.match(String(failed.data.reason), /Chat not found for current user/);
});

test("non-participant cannot read messages or send REST messages", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");
  const vera = await authenticateByCode(app, "+15551230013");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;

  await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Только для участников",
    })
    .expect(201);

  await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${vera.token}`)
    .expect(404);

  await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${vera.token}`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Чужое сообщение",
    })
    .expect(404);

  const participantMessages = await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(participantMessages.body.length, 1);
});

test("duplicate clientMessageId does not create duplicate message", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const clientMessageId = randomUUID();
  const annaClient = await openRealtimeSocket(app, anna.token);
  t.after(() => {
    annaClient.socket.close();
  });

  await annaClient.nextEvent("connection.ready");

  sendRealtimeEvent(annaClient.socket, "message.send", {
    chatID,
    clientMessageId,
    kind: "text",
    text: "Дубликат",
  });
  const firstAck = await annaClient.nextEvent<{ message: { id: string } }>(
    "message.send.ack",
  );

  sendRealtimeEvent(annaClient.socket, "message.send", {
    chatID,
    clientMessageId,
    kind: "text",
    text: "Дубликат",
  });
  const secondAck = await annaClient.nextEvent<{ message: { id: string } }>(
    "message.send.ack",
  );

  assert.equal(firstAck.data.message.id, secondAck.data.message.id);

  const messagesResponse = await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(messagesResponse.body.length, 1);
  assert.equal(messagesResponse.body[0].messageID, clientMessageId);
});

test("message author can edit and delete own message with realtime updates", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const annaClient = await openRealtimeSocket(app, anna.token);
  const borisClient = await openRealtimeSocket(app, boris.token);
  t.after(() => {
    annaClient.socket.close();
    borisClient.socket.close();
  });

  await annaClient.nextEvent("connection.ready");
  await borisClient.nextEvent("connection.ready");

  const messageResponse = await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Первая версия",
    })
    .expect(201);

  const messageID = messageResponse.body.id as string;

  const updatedResponse = await request(app.getHttpServer())
    .patch(`/api/chats/${chatID}/messages/${messageID}`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      text: "Исправленная версия",
    })
    .expect(200);

  assert.equal(updatedResponse.body.text, "Исправленная версия");
  assert.equal(typeof updatedResponse.body.editedAt, "string");

  const updatedEvent = await borisClient.nextEvent<{
    chatID: string;
    message: { id: string; text: string; editedAt: string };
  }>("message.updated");
  assert.equal(updatedEvent.data.chatID, chatID);
  assert.equal(updatedEvent.data.message.id, messageID);
  assert.equal(updatedEvent.data.message.text, "Исправленная версия");
  assert.equal(typeof updatedEvent.data.message.editedAt, "string");

  const deletedResponse = await request(app.getHttpServer())
    .delete(`/api/chats/${chatID}/messages/${messageID}`)
    .set("Authorization", `Bearer ${anna.token}`)
    .expect(200);

  assert.equal(deletedResponse.body.text, "Сообщение удалено");
  assert.equal(typeof deletedResponse.body.deletedAt, "string");
  assert.equal(deletedResponse.body.mediaID, null);
  assert.equal(deletedResponse.body.mediaURL, null);

  const deletedEvent = await borisClient.nextEvent<{
    chatID: string;
    message: { id: string; text: string; deletedAt: string; mediaURL: null };
  }>("message.deleted");
  assert.equal(deletedEvent.data.chatID, chatID);
  assert.equal(deletedEvent.data.message.id, messageID);
  assert.equal(deletedEvent.data.message.text, "Сообщение удалено");
  assert.equal(typeof deletedEvent.data.message.deletedAt, "string");
  assert.equal(deletedEvent.data.message.mediaURL, null);

  const messagesResponse = await request(app.getHttpServer())
    .get(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(200);

  assert.equal(messagesResponse.body[0].text, "Сообщение удалено");
  assert.equal(typeof messagesResponse.body[0].editedAt, "string");
  assert.equal(typeof messagesResponse.body[0].deletedAt, "string");
});

test("non-author cannot edit or delete another user's message", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");
  const boris = await authenticateByCode(app, "+15551230012");

  const createChatResponse = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      title: "Борис Demo",
      participantContacts: ["+15551230012"],
    })
    .expect(201);

  const chatID = createChatResponse.body.id as string;
  const messageResponse = await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${anna.token}`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Только автор может менять",
    })
    .expect(201);

  const messageID = messageResponse.body.id as string;

  await request(app.getHttpServer())
    .patch(`/api/chats/${chatID}/messages/${messageID}`)
    .set("Authorization", `Bearer ${boris.token}`)
    .send({
      text: "Чужое изменение",
    })
    .expect(404);

  await request(app.getHttpServer())
    .delete(`/api/chats/${chatID}/messages/${messageID}`)
    .set("Authorization", `Bearer ${boris.token}`)
    .expect(404);
});

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
  const sentMessages: Array<Record<string, unknown>> = [];
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
  assert.match(String(sentMessages[0]?.text), /Откройте приложение и нажмите/i);
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
  assert.match(String(sentMessages[0]?.text), /mini app подписки/i);

  const replyMarkup = JSON.parse(String(sentMessages[0]?.reply_markup)) as {
    inline_keyboard: Array<Array<Record<string, unknown>>>;
  };
  const firstButton = replyMarkup.inline_keyboard[0]?.[0];
  assert.equal(
    (firstButton?.web_app as { url?: string } | undefined)?.url,
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
  assert.match(String(sentMessages[0]?.text), /Привязка начата/i);
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
  assert.match(String(sentMessages[0]?.text), /Срок действия ссылки истёк/i);
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
  const sentMessages: Array<Record<string, unknown>> = [];
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

  assert.match(String(sentMessages[0]?.text), /уже использована/i);
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
    String(sentMessages[sentMessages.length - 1]?.text),
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
    String(sentMessages[sentMessages.length - 1]?.text),
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
  const sentMessages: Array<Record<string, unknown>> = [];
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
    String(sentMessages[sentMessages.length - 1]?.text),
    /Автоперепривязка отключена/i,
  );
});

test("/auth/request sends code when TelegramLink exists", async (t) => {
  const app = await createTestApp({ verificationProvider: "telegram" });
  t.after(async () => {
    await app.close();
  });

  const originalFetch = globalThis.fetch;
  const sentBodies: Array<Record<string, unknown>> = [];
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
  const sendMessagePayload = sentBodies.find((item) => item.chat_id === "999");
  assert.ok(sendMessagePayload);
  assert.match(String(sendMessagePayload?.text), /Mobile Messenger/);
  assert.match(String(sendMessagePayload?.text), /123456/);
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
