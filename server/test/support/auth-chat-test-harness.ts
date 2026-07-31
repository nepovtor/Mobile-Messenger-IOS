import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataType, newDb } from "pg-mem";
import request from "supertest";
import { WebSocket } from "ws";
import { ChatEntity } from "../../src/entities/chat.entity";
import { ChatParticipantEntity } from "../../src/entities/chat-participant.entity";
import { ContactEntity } from "../../src/entities/contact.entity";
import { MediaEntity, MediaStatus } from "../../src/entities/media.entity";
import { MessageEntity } from "../../src/entities/message.entity";
import { PhoneVerificationCodeEntity } from "../../src/entities/phone-verification-code.entity";
import { PushSubscriptionEntity } from "../../src/entities/push-subscription.entity";
import { TelegramLinkEntity } from "../../src/entities/telegram-link.entity";
import { TelegramPairingTokenEntity } from "../../src/entities/telegram-pairing-token.entity";
import { UserEntity } from "../../src/entities/user.entity";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { ChatModule } from "../../src/modules/chat/chat.module";
import { MediaModule } from "../../src/modules/media/media.module";
import { MediaService } from "../../src/modules/media/media.service";
import { RealtimeModule } from "../../src/modules/realtime/realtime.module";
import { HealthModule } from "../../src/modules/health/health.module";
import { UsersModule } from "../../src/modules/users/users.module";
import type { SmsService } from "../../src/modules/auth/sms/sms.types";

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

export type TestAppOptions = {
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
  e2eeRequired?: boolean;
  beforeInit?: (app: INestApplication) => Promise<void> | void;
};

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  process.env["NODE_ENV"] = "test";
  process.env["JWT_SECRET"] = "test-jwt-secret";
  process.env["JWT_EXPIRES_IN"] = "7d";
  process.env["DB_SYNCHRONIZE"] = "true";
  process.env["E2EE_ENABLED"] = options.e2eeRequired ? "true" : "false";
  process.env["E2EE_REQUIRED"] = options.e2eeRequired ? "true" : "false";
  process.env["LEGACY_MESSAGES_READ_ENABLED"] = options.e2eeRequired
    ? "false"
    : "true";
  process.env["REALTIME_SESSION_REVALIDATION_INTERVAL_MS"] = "50";
  process.env["AUTH_ENABLE_DEMO_ACCOUNTS"] =
    options.enableDemoAccounts === false ? "false" : "true";
  process.env["AUTH_ALLOW_PASSWORD_LOGIN"] = options.allowPasswordLogin
    ? "true"
    : "false";
  process.env["AUTH_ALLOW_TEST_CODE"] =
    options.allowTestCode === false ? "false" : "true";
  process.env["AUTH_TEST_CODE"] = "123456";
  process.env["AUTH_CODE_TTL_SECONDS"] = String(
    options.authCodeTTLSeconds ?? 300,
  );
  process.env["AUTH_CODE_MAX_ATTEMPTS"] = String(
    options.authCodeMaxAttempts ?? 5,
  );
  process.env["AUTH_CODE_RESEND_COOLDOWN_SECONDS"] = String(
    options.authCodeResendCooldownSeconds ?? 60,
  );
  process.env["CHAT_ENABLE_DEMO_SEEDING"] = options.enableDemoChatSeeding
    ? "true"
    : "false";
  process.env["AUTH_RATE_LIMIT_WINDOW_MS"] = "60000";
  process.env["AUTH_RATE_LIMIT_MAX_REQUESTS"] = String(
    options.authRateLimitMaxRequests ?? 20,
  );
  process.env["VERIFICATION_PROVIDER"] = options.verificationProvider ?? "mock";
  process.env["SMS_PROVIDER"] = options.smsProvider ?? "mock";
  if (options.telegramBotToken === null) {
    delete process.env["TELEGRAM_BOT_TOKEN"];
  } else {
    process.env["TELEGRAM_BOT_TOKEN"] =
      options.telegramBotToken ?? "test-telegram-token";
  }
  process.env["TELEGRAM_BOT_USERNAME"] = "mobile_messenger_test_bot";
  process.env["TELEGRAM_ALLOW_TEXT_PHONE_LINKING"] =
    options.telegramAllowTextPhoneLinking ? "true" : "false";
  process.env["TELEGRAM_REQUIRE_OWN_CONTACT"] =
    options.telegramRequireOwnContact === false ? "false" : "true";
  process.env["TELEGRAM_PAIRING_TOKEN_TTL_SECONDS"] = String(
    options.telegramPairingTokenTTLSeconds ?? 600,
  );
  process.env["TELEGRAM_LINK_RESEND_COOLDOWN_SECONDS"] = String(
    options.telegramLinkResendCooldownSeconds ?? 60,
  );
  process.env["TELEGRAM_ALLOW_RELINK"] = options.telegramAllowRelink
    ? "true"
    : "false";
  if (options.webAppUrl === null) {
    delete process.env["WEB_APP_URL"];
  } else {
    process.env["WEB_APP_URL"] =
      options.webAppUrl ?? "https://web.example.test";
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRootAsync({
        useFactory: async () => ({
          type: "postgres",
          autoLoadEntities: true,
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
      UsersModule,
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

export function realtimeURL(app: INestApplication): string {
  const address = app.getHttpServer().address();
  const port = typeof address === "string" ? 80 : address?.port;
  return `ws://127.0.0.1:${port}/realtime`;
}

export type TransportEnvelopeValue = object | string | number | boolean | null;

export type TransportEnvelope = Record<
  string,
  TransportEnvelopeValue | undefined
>;

export type SocketEvent<TData = TransportEnvelopeValue> = {
  event: string;
  data: TData;
};

export type MockSmsProviderLike = SmsService & {
  sentMessages: Array<{ phone: string; code: string }>;
};

export async function openRealtimeSocket(
  app: INestApplication,
  token: string,
): Promise<{
  socket: WebSocket;
  nextEvent: <TData = TransportEnvelopeValue>(
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
        nextEvent: async <TData = TransportEnvelopeValue>(
          eventName: string,
        ) => {
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

export function sendRealtimeEvent(
  socket: WebSocket,
  event: string,
  data: TransportEnvelope,
): void {
  socket.send(JSON.stringify({ event, data }));
}

export async function authenticateByCode(
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
