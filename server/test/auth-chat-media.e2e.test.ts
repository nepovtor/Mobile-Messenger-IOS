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
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataType, newDb } from "pg-mem";
import request from "supertest";
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
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
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
