import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataType, newDb } from "pg-mem";
import request from "supertest";
import { ChatEntity } from "../src/entities/chat.entity";
import { ChatParticipantEntity } from "../src/entities/chat-participant.entity";
import { ContactEntity } from "../src/entities/contact.entity";
import { LocationShareEntity } from "../src/entities/location-share.entity";
import { MediaEntity } from "../src/entities/media.entity";
import { MessageEntity } from "../src/entities/message.entity";
import { PhoneVerificationCodeEntity } from "../src/entities/phone-verification-code.entity";
import { TelegramLinkEntity } from "../src/entities/telegram-link.entity";
import { UserEntity } from "../src/entities/user.entity";
import { AuthModule } from "../src/modules/auth/auth.module";
import { ChatModule } from "../src/modules/chat/chat.module";
import { ContactsModule } from "../src/modules/contacts/contacts.module";
import { MediaModule } from "../src/modules/media/media.module";
import { LocationModule } from "../src/modules/location/location.module";
import { RealtimeModule } from "../src/modules/realtime/realtime.module";
import { UsersModule } from "../src/modules/users/users.module";

async function createTestApp(): Promise<INestApplication> {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.JWT_EXPIRES_IN = "7d";
  process.env.DB_SYNCHRONIZE = "true";
  process.env.AUTH_ENABLE_DEMO_ACCOUNTS = "true";
  process.env.AUTH_ALLOW_PASSWORD_LOGIN = "true";
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

  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRootAsync({
        useFactory: async () => ({
          type: "postgres",
          entities: [
            UserEntity,
            ContactEntity,
            LocationShareEntity,
            PhoneVerificationCodeEntity,
            TelegramLinkEntity,
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
      UsersModule,
      ContactsModule,
      LocationModule,
      MediaModule,
      ChatModule,
    ],
  }).compile();

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
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(path)
        .set("Authorization", `Bearer ${token}`),
    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(path)
        .set("Authorization", `Bearer ${token}`),
  };
}

test("contacts: authenticated user can add existing user by phone", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100001", "Owner");
  await authenticateUser(app, "+15550100002", "Contact");

  const response = await authedRequest(app, owner.token)
    .post("/api/contacts")
    .send({ phone: "+1 (555) 010-0002" });

  assert.equal(response.status, 201);
  assert.equal(response.body.displayName, "Contact");
  assert.equal(response.body.phone, "+15550100002");
  assert.ok(response.body.directChatID);
});

test("contacts: user cannot add himself", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100003", "Self");

  const response = await authedRequest(app, owner.token)
    .post("/api/contacts")
    .send({ phone: "+15550100003" });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "CANNOT_ADD_SELF");
});

test("contacts: adding same contact twice does not create duplicate", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100004", "Owner");
  await authenticateUser(app, "+15550100005", "Repeat");
  const api = authedRequest(app, owner.token);

  const firstAdd = await api
    .post("/api/contacts")
    .send({ phone: "+15550100005" });
  const secondAdd = await api
    .post("/api/contacts")
    .send({ phone: "+15550100005" });
  const list = await api.get("/api/contacts");

  assert.equal(firstAdd.status, 201);
  assert.equal(secondAdd.status, 201);
  assert.equal(secondAdd.body.alreadyExists, true);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
});

test("contacts: user cannot see contacts of another user", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100006", "Owner");
  const stranger = await authenticateUser(app, "+15550100007", "Stranger");
  await authenticateUser(app, "+15550100008", "Private Contact");

  await authedRequest(app, owner.token)
    .post("/api/contacts")
    .send({ phone: "+15550100008" });

  const response = await authedRequest(app, stranger.token).get(
    "/api/contacts",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("contacts: adding unknown phone returns USER_NOT_FOUND", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100009", "Owner");
  const response = await authedRequest(app, owner.token)
    .post("/api/contacts")
    .send({ phone: "+15550999999" });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "USER_NOT_FOUND");
});

test("contacts: contact list returns only current user contacts", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100010", "Owner");
  await authenticateUser(app, "+15550100011", "First");
  await authenticateUser(app, "+15550100012", "Second");

  const api = authedRequest(app, owner.token);
  await api.post("/api/contacts").send({ phone: "+15550100011" });
  await api.post("/api/contacts").send({ phone: "+15550100012" });

  const response = await api.get("/api/contacts");

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.map((contact: { phone: string }) => contact.phone).sort(),
    ["+15550100011", "+15550100012"],
  );
});

test("contacts: direct chat is created or reused after adding contact", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100013", "Owner");
  const contact = await authenticateUser(app, "+15550100014", "Contact");
  const ownerApi = authedRequest(app, owner.token);

  const createdChat = await ownerApi.post("/api/chats").send({
    title: "Existing Direct",
    participantIDs: [contact.userID],
  });
  assert.equal(createdChat.status, 201);

  const response = await ownerApi.post("/api/contacts").send({
    phone: "+15550100014",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.directChatID, createdChat.body.id);
});

test("profile: user can update own displayName", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100015", "Before");
  const response = await authedRequest(app, user.token)
    .patch("/api/users/me/profile")
    .send({ displayName: "  Новое имя  " });

  assert.equal(response.status, 200);
  assert.equal(response.body.displayName, "Новое имя");
});

test("profile: empty displayName rejected", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100016", "Before");
  const response = await authedRequest(app, user.token)
    .patch("/api/users/me/profile")
    .send({ displayName: "   " });

  assert.equal(response.status, 400);
});

test("profile: too long displayName rejected", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100017", "Before");
  const response = await authedRequest(app, user.token)
    .patch("/api/users/me/profile")
    .send({ displayName: "а".repeat(41) });

  assert.equal(response.status, 400);
});

test("profile: unauthenticated request rejected", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const response = await request(app.getHttpServer())
    .patch("/api/users/me/profile")
    .send({ displayName: "Nope" });

  assert.equal(response.status, 401);
});

test("profile: update does not change phone or userID", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100018", "Stable");
  const response = await authedRequest(app, user.token)
    .patch("/api/users/me/profile")
    .send({ displayName: "Updated" });

  assert.equal(response.status, 200);
  assert.equal(response.body.userID, user.userID);
  assert.equal(response.body.phone, "+15550100018");
});

test("profile: demo user can update displayName without breaking login", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const login = await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({
      method: "phone",
      contact: "+15551230011",
      password: "demo1111",
    });
  assert.equal(login.status, 201);

  const updated = await authedRequest(app, login.body.token as string)
    .patch("/api/users/me/profile")
    .send({ displayName: "Анна Updated" });
  assert.equal(updated.status, 200);

  const secondLogin = await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({
      method: "phone",
      contact: "+15551230011",
      password: "demo1111",
    });
  assert.equal(secondLogin.status, 201);

  const me = await authedRequest(app, secondLogin.body.token as string).get(
    "/api/auth/me",
  );
  assert.equal(me.status, 200);
  assert.equal(me.body.displayName, "Анна Updated");
});

test("location: user can update own location", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100019", "Locator");
  const api = authedRequest(app, user.token);

  const updateResponse = await api.post("/api/location/me").send({
    latitude: 53.9,
    longitude: 27.56,
    accuracy: 25,
    sharingEnabled: true,
  });
  const readResponse = await api.get("/api/location/me");

  assert.equal(updateResponse.status, 201);
  assert.equal(updateResponse.body.sharingEnabled, true);
  assert.equal(updateResponse.body.latitude, 53.9);
  assert.equal(updateResponse.body.longitude, 27.56);
  assert.equal(updateResponse.body.accuracy, 25);
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.body.latitude, 53.9);
});

test("location: invalid coordinates rejected", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100020", "Locator");
  const response = await authedRequest(app, user.token)
    .post("/api/location/me")
    .send({
      latitude: 120,
      longitude: 27.56,
      accuracy: -1,
      sharingEnabled: true,
    });

  assert.equal(response.status, 400);
});

test("location: user can disable location sharing", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const user = await authenticateUser(app, "+15550100021", "Locator");
  const api = authedRequest(app, user.token);

  await api.post("/api/location/me").send({
    latitude: 53.9,
    longitude: 27.56,
    accuracy: 25,
    sharingEnabled: true,
  });

  const disableResponse = await api.delete("/api/location/me");
  const readResponse = await api.get("/api/location/me");

  assert.equal(disableResponse.status, 200);
  assert.equal(disableResponse.body.ok, true);
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.body.sharingEnabled, false);
  assert.equal(readResponse.body.latitude, null);
  assert.equal(readResponse.body.longitude, null);
});

test("location: contacts see only sharing contacts", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100022", "Owner");
  const visibleContact = await authenticateUser(
    app,
    "+15550100023",
    "Visible Contact",
  );
  await authenticateUser(app, "+15550100024", "Hidden Contact");
  const ownerApi = authedRequest(app, owner.token);

  await ownerApi.post("/api/contacts").send({ phone: "+15550100023" });
  await ownerApi.post("/api/contacts").send({ phone: "+15550100024" });
  await authedRequest(app, visibleContact.token)
    .post("/api/location/me")
    .send({
      latitude: 53.91,
      longitude: 27.57,
      accuracy: 18,
      sharingEnabled: true,
    });

  const response = await ownerApi.get("/api/location/contacts");

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].displayName, "Visible Contact");
  assert.equal(response.body[0].phone, "+15550100023");
});

test("location: contacts do not see users without consent or non-contacts", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const owner = await authenticateUser(app, "+15550100025", "Owner");
  const visibleContact = await authenticateUser(
    app,
    "+15550100026",
    "Visible Contact",
  );
  const outsider = await authenticateUser(app, "+15550100027", "Outsider");
  const ownerApi = authedRequest(app, owner.token);

  await ownerApi.post("/api/contacts").send({ phone: "+15550100026" });

  await authedRequest(app, visibleContact.token)
    .post("/api/location/me")
    .send({
      latitude: 53.92,
      longitude: 27.58,
      accuracy: 11,
      sharingEnabled: false,
    });

  await authedRequest(app, outsider.token)
    .post("/api/location/me")
    .send({
      latitude: 53.93,
      longitude: 27.59,
      accuracy: 9,
      sharingEnabled: true,
    });

  const response = await ownerApi.get("/api/location/contacts");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("location: unauthenticated request rejected", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const response = await request(app.getHttpServer()).get(
    "/api/location/contacts",
  );

  assert.equal(response.status, 401);
});
