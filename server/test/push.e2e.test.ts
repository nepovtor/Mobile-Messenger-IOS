import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import { Test } from "@nestjs/testing";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { DataType, newDb } from "pg-mem";
import request from "supertest";
import { Repository } from "typeorm";
import { ChatEntity } from "../src/entities/chat.entity";
import { ChatParticipantEntity } from "../src/entities/chat-participant.entity";
import { ContactEntity } from "../src/entities/contact.entity";
import { MediaEntity, MediaStatus } from "../src/entities/media.entity";
import { MessageEntity } from "../src/entities/message.entity";
import {
  PushPlatform,
  PushSubscriptionEntity,
} from "../src/entities/push-subscription.entity";
import { PhoneVerificationCodeEntity } from "../src/entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../src/entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../src/entities/telegram-pairing-token.entity";
import { UserEntity } from "../src/entities/user.entity";
import { AuthModule } from "../src/modules/auth/auth.module";
import { ChatModule } from "../src/modules/chat/chat.module";
import { HealthModule } from "../src/modules/health/health.module";
import { MediaModule } from "../src/modules/media/media.module";
import { MediaService } from "../src/modules/media/media.service";
import { ApnsPushProvider } from "../src/modules/push/apns-push.provider";
import type { MessageCreatedPushPayload } from "../src/modules/push/push.types";
import { UsersModule } from "../src/modules/users/users.module";
import { WebPushProvider } from "../src/modules/push/web-push.provider";
import { RealtimeModule } from "../src/modules/realtime/realtime.module";

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

class FakeWebPushProvider {
  deliveries: Array<{
    endpoint: string;
    payload: MessageCreatedPushPayload;
  }> = [];
  configured = true;
  resultsByEndpoint = new Map<
    string,
    | {
        ok: true;
      }
    | {
        ok: false;
        reason: string;
        statusCode?: number;
        invalidToken?: boolean;
      }
  >();

  isConfigured() {
    return this.configured;
  }

  getPublicKey() {
    return this.configured ? "test-vapid-public-key" : null;
  }

  async send(target: { endpoint: string }, payload: MessageCreatedPushPayload) {
    this.deliveries.push({
      endpoint: target.endpoint,
      payload,
    });

    return this.resultsByEndpoint.get(target.endpoint) ?? { ok: true };
  }
}

class FakeApnsPushProvider {
  deliveries: Array<{
    deviceToken: string;
    payload: MessageCreatedPushPayload;
  }> = [];
  configured = true;

  isConfigured() {
    return this.configured;
  }

  async send(
    target: { deviceToken: string },
    payload: MessageCreatedPushPayload,
  ) {
    this.deliveries.push({
      deviceToken: target.deviceToken,
      payload,
    });
    return { ok: true } as const;
  }
}

async function createTestApp() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.JWT_EXPIRES_IN = "7d";
  process.env.DB_SYNCHRONIZE = "true";
  process.env.AUTH_ENABLE_DEMO_ACCOUNTS = "true";
  process.env.AUTH_ALLOW_PASSWORD_LOGIN = "false";
  process.env.AUTH_ALLOW_TEST_CODE = "true";
  process.env.AUTH_TEST_CODE = "123456";
  process.env.AUTH_CODE_TTL_SECONDS = "300";
  process.env.AUTH_CODE_MAX_ATTEMPTS = "5";
  process.env.AUTH_CODE_RESEND_COOLDOWN_SECONDS = "0";
  process.env.CHAT_ENABLE_DEMO_SEEDING = "false";
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = "50";
  process.env.VERIFICATION_PROVIDER = "mock";
  process.env.SMS_PROVIDER = "mock";
  process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
  process.env.TELEGRAM_BOT_USERNAME = "mobile_messenger_test_bot";

  const fakeWebPushProvider = new FakeWebPushProvider();
  const fakeApnsPushProvider = new FakeApnsPushProvider();

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
      UsersModule,
    ],
  })
    .overrideProvider(MediaService)
    .useValue(new FakeMediaService())
    .overrideProvider(WebPushProvider)
    .useValue(fakeWebPushProvider)
    .overrideProvider(ApnsPushProvider)
    .useValue(fakeApnsPushProvider)
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
  await app.init();
  await app.listen(0);

  return {
    app,
    fakeWebPushProvider,
    fakeApnsPushProvider,
    pushSubscriptionsRepository: moduleRef.get<
      Repository<PushSubscriptionEntity>
    >(getRepositoryToken(PushSubscriptionEntity)),
  };
}

async function authenticateUser(
  app: INestApplication,
  phone: string,
  displayName: string,
): Promise<{ token: string; userID: string }> {
  const requestCodeResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({
      method: "phone",
      contact: phone,
    });
  assert.equal(requestCodeResponse.status, 201);

  const response = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      method: "phone",
      contact: phone,
      code: "123456",
    });

  assert.equal(response.status, 201);
  const token = response.body.token as string;
  const userID = response.body.userID as string;

  if (displayName !== response.body.displayName) {
    const updateProfileResponse = await request(app.getHttpServer())
      .patch("/api/users/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName });
    assert.equal(updateProfileResponse.status, 200);
  }

  return {
    token,
    userID,
  };
}

function authedRequest(app: INestApplication, token: string) {
  return {
    get: (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${token}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(path)
        .set("Authorization", `Bearer ${token}`),
    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(path)
        .set("Authorization", `Bearer ${token}`),
  };
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 1000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for async condition");
}

test("push: registers web push subscriptions for the authenticated user", async (t) => {
  const { app, pushSubscriptionsRepository } = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15553670001", "Push User");
  const response = await authedRequest(app, user.token)
    .post("/api/push/subscriptions")
    .send({
      endpoint: "https://push.example.test/subscriptions/1",
      expirationTime: null,
      keys: {
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      userAgent: "Vitest Browser",
    });

  assert.equal(response.status, 201);

  const subscription = await pushSubscriptionsRepository.findOneBy({
    userId: user.userID,
    endpoint: "https://push.example.test/subscriptions/1",
  });
  assert.ok(subscription);
  assert.equal(subscription.platform, PushPlatform.WEB);
  assert.equal(subscription.disabledAt, null);
});

test("push: deletes web push subscriptions without removing historical rows", async (t) => {
  const { app, pushSubscriptionsRepository } = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15553670002", "Push Delete");
  const api = authedRequest(app, user.token);

  await api.post("/api/push/subscriptions").send({
    endpoint: "https://push.example.test/subscriptions/2",
    expirationTime: null,
    keys: {
      p256dh: "test-p256dh",
      auth: "test-auth",
    },
  });

  const response = await api.delete("/api/push/subscriptions").send({
    endpoint: "https://push.example.test/subscriptions/2",
  });
  assert.equal(response.status, 200);

  const subscription = await pushSubscriptionsRepository.findOneBy({
    userId: user.userID,
    endpoint: "https://push.example.test/subscriptions/2",
  });
  assert.ok(subscription);
  assert.ok(subscription.disabledAt instanceof Date);
});

test("push: message.created notifications do not notify the author", async (t) => {
  const { app, fakeWebPushProvider } = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const author = await authenticateUser(app, "+15553670003", "Author");
  const recipient = await authenticateUser(app, "+15553670004", "Recipient");
  const authorApi = authedRequest(app, author.token);
  const recipientApi = authedRequest(app, recipient.token);

  await authorApi.post("/api/push/subscriptions").send({
    endpoint: "https://push.example.test/subscriptions/author",
    expirationTime: null,
    keys: {
      p256dh: "author-p256dh",
      auth: "author-auth",
    },
  });
  await recipientApi.post("/api/push/subscriptions").send({
    endpoint: "https://push.example.test/subscriptions/recipient",
    expirationTime: null,
    keys: {
      p256dh: "recipient-p256dh",
      auth: "recipient-auth",
    },
  });

  const createChatResponse = await authorApi.post("/api/chats").send({
    title: "Push Direct",
    participantIDs: [recipient.userID],
  });
  assert.equal(createChatResponse.status, 201);
  const chatID = createChatResponse.body.id as string;

  const sendResponse = await authorApi
    .post(`/api/chats/${chatID}/messages`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Hello from push delivery test",
    });
  assert.equal(sendResponse.status, 201);

  await waitFor(() => fakeWebPushProvider.deliveries.length === 1);
  assert.equal(
    fakeWebPushProvider.deliveries[0].endpoint,
    "https://push.example.test/subscriptions/recipient",
  );
  assert.equal(fakeWebPushProvider.deliveries[0].payload.chatId, chatID);
});

test("push: invalid subscriptions are disabled after upstream rejection", async (t) => {
  const { app, fakeWebPushProvider, pushSubscriptionsRepository } =
    await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const author = await authenticateUser(app, "+15553670005", "Author");
  const recipient = await authenticateUser(app, "+15553670006", "Recipient");
  const authorApi = authedRequest(app, author.token);
  const recipientApi = authedRequest(app, recipient.token);

  const endpoint = "https://push.example.test/subscriptions/stale";
  await recipientApi.post("/api/push/subscriptions").send({
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: "stale-p256dh",
      auth: "stale-auth",
    },
  });
  fakeWebPushProvider.resultsByEndpoint.set(endpoint, {
    ok: false,
    reason: "Expired subscription",
    statusCode: 410,
    invalidToken: true,
  });

  const createChatResponse = await authorApi.post("/api/chats").send({
    title: "Push Invalid",
    participantIDs: [recipient.userID],
  });
  assert.equal(createChatResponse.status, 201);

  const sendResponse = await authorApi
    .post(`/api/chats/${createChatResponse.body.id as string}/messages`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "This push should disable the stale subscription",
    });
  assert.equal(sendResponse.status, 201);

  await waitFor(async () => {
    const subscription = await pushSubscriptionsRepository.findOneBy({
      endpoint,
    });
    return Boolean(subscription?.disabledAt);
  });
});

test("push: provider failures do not crash message sending", async (t) => {
  const { app, fakeWebPushProvider, pushSubscriptionsRepository } =
    await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const author = await authenticateUser(app, "+15553670007", "Author");
  const recipient = await authenticateUser(app, "+15553670008", "Recipient");
  const authorApi = authedRequest(app, author.token);
  const recipientApi = authedRequest(app, recipient.token);

  const endpoint = "https://push.example.test/subscriptions/flaky";
  await recipientApi.post("/api/push/subscriptions").send({
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: "flaky-p256dh",
      auth: "flaky-auth",
    },
  });
  fakeWebPushProvider.resultsByEndpoint.set(endpoint, {
    ok: false,
    reason: "Temporary upstream failure",
  });

  const createChatResponse = await authorApi.post("/api/chats").send({
    title: "Push Failure Safe",
    participantIDs: [recipient.userID],
  });
  assert.equal(createChatResponse.status, 201);
  const chatID = createChatResponse.body.id as string;

  const sendResponse = await authorApi
    .post(`/api/chats/${chatID}/messages`)
    .send({
      messageID: randomUUID(),
      kind: "text",
      text: "Message should still persist even if push delivery fails",
    });
  assert.equal(sendResponse.status, 201);

  await waitFor(() => fakeWebPushProvider.deliveries.length === 1);
  const subscription = await pushSubscriptionsRepository.findOneBy({
    endpoint,
  });
  assert.ok(subscription);
  assert.equal(subscription.disabledAt, null);
});
