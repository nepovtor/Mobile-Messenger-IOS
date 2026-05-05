import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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
import { TelegramPairingTokenEntity } from "../src/entities/telegram-pairing-token.entity";
import { UserEntity } from "../src/entities/user.entity";
import { AdminModule } from "../src/modules/admin/admin.module";
import { SystemModule } from "../src/modules/system/system.module";

async function createTestApp(): Promise<INestApplication> {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.JWT_EXPIRES_IN = "7d";
  process.env.ADMIN_LOGIN = "control";
  process.env.ADMIN_PASSWORD = "control123";
  process.env.ADMIN_DISPLAY_NAME = "Control Room";
  process.env.DB_SYNCHRONIZE = "true";
  process.env.AUTH_ENABLE_DEMO_ACCOUNTS = "false";
  process.env.CHAT_ENABLE_DEMO_SEEDING = "false";

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
            TelegramPairingTokenEntity,
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
      AdminModule,
      SystemModule,
    ],
  }).compile();

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
  await app.listen(0);
  return app;
}

test("admin auth: separate admin login can open admin me and system routes", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const loginResponse = await request(app.getHttpServer())
    .post("/api/admin/login")
    .send({
      login: "control",
      password: "control123",
    });

  assert.equal(loginResponse.status, 201);
  assert.equal(loginResponse.body.admin.login, "control");
  assert.equal(loginResponse.body.admin.role, "admin");
  assert.equal(loginResponse.body.admin.displayName, "Control Room");
  assert.equal(typeof loginResponse.body.token, "string");

  const token = loginResponse.body.token as string;

  const meResponse = await request(app.getHttpServer())
    .get("/api/admin/me")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.body.login, "control");
  assert.equal(meResponse.body.role, "admin");

  const overviewResponse = await request(app.getHttpServer())
    .get("/api/system/overview")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(overviewResponse.status, 200);
  assert.equal(overviewResponse.body.authentication.adminLogin, "control");
  assert.equal(overviewResponse.body.authentication.adminConsoleEnabled, true);
});

test("admin auth: user jwt cannot access admin-only system routes", async (t) => {
  const app = await createTestApp();
  t.after(async () => {
    await app.close();
  });

  const userToken = await new JwtService().signAsync(
    {
      sub: "user-1",
      displayName: "Regular User",
      contact: "+15550000001",
      method: "phone",
      phone: "+15550000001",
    },
    {
      secret: "test-jwt-secret",
    },
  );

  const overviewResponse = await request(app.getHttpServer())
    .get("/api/system/overview")
    .set("Authorization", `Bearer ${userToken}`);

  assert.equal(overviewResponse.status, 401);
});
