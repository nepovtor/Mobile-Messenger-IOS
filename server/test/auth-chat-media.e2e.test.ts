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
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataType, newDb } from "pg-mem";
import request from "supertest";
import { WebSocket } from "ws";
import { ChatEntity } from "../src/entities/chat.entity";
import { ChatParticipantEntity } from "../src/entities/chat-participant.entity";
import { MediaEntity, MediaStatus } from "../src/entities/media.entity";
import { MessageEntity } from "../src/entities/message.entity";
import { UserEntity } from "../src/entities/user.entity";
import { AuthModule } from "../src/modules/auth/auth.module";
import { ChatModule } from "../src/modules/chat/chat.module";
import { MediaModule } from "../src/modules/media/media.module";
import { MediaService } from "../src/modules/media/media.service";
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

type TestAppOptions = {
  allowPasswordLogin?: boolean;
  authRateLimitMaxRequests?: number;
};

async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.DB_SYNCHRONIZE = "true";
  process.env.AUTH_ENABLE_DEMO_ACCOUNTS = "true";
  process.env.AUTH_ALLOW_PASSWORD_LOGIN = options.allowPasswordLogin
    ? "true"
    : "false";
  process.env.AUTH_EXPOSE_DEBUG_CODE = "true";
  process.env.CHAT_ENABLE_DEMO_SEEDING = "false";
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = String(
    options.authRateLimitMaxRequests ?? 20,
  );

  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRootAsync({
        useFactory: async () => ({
          type: "postgres",
          entities: [
            UserEntity,
            ChatEntity,
            ChatParticipantEntity,
            MessageEntity,
            MediaEntity,
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
): Promise<{ token: string; userID: string; displayName: string }> {
  const requestCodeResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ method: "phone", contact })
    .expect(201);

  assert.equal(typeof requestCodeResponse.body.debugCode, "string");

  const verifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      method: "phone",
      contact,
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

test("verification codes are single-use and contacts keep current user first", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const requestCodeResponse = await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ method: "phone", contact: "+15551230011" })
    .expect(201);

  const debugCode = requestCodeResponse.body.debugCode as string;
  assert.equal(typeof debugCode, "string");

  const firstVerifyResponse = await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      method: "phone",
      contact: "+15551230011",
      code: debugCode,
    })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/verify")
    .send({
      method: "phone",
      contact: "+15551230011",
      code: debugCode,
    })
    .expect(401);

  const contactsResponse = await request(app.getHttpServer())
    .get("/api/auth/contacts")
    .set("Authorization", `Bearer ${firstVerifyResponse.body.token}`)
    .expect(200);

  assert.equal(contactsResponse.body[0].isCurrentUser, true);
  assert.equal(contactsResponse.body[0].contact, "+15551230011");
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

  const ready = await client.nextEvent<{ userID: string }>("connection.ready");
  assert.equal(ready.data.userID, anna.userID);
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
    .send({ method: "phone", contact: "+15551230011" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ method: "phone", contact: "+15551230011" })
    .expect(201);

  await request(app.getHttpServer())
    .post("/api/auth/request")
    .send({ method: "phone", contact: "+15551230011" })
    .expect(429);
});
