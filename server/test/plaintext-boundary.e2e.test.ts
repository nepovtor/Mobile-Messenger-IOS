import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { ChatEntity } from "../src/entities/chat.entity";
import { MessageEntity, MessageKind } from "../src/entities/message.entity";
import { ChatService } from "../src/modules/chat/chat.service";
import {
  authenticateByCode,
  createTestApp,
} from "./support/auth-chat-test-harness";

test("E2EE_REQUIRED rejects new plaintext messages and legacy reads", async (t) => {
  const app = await createTestApp({ e2eeRequired: true });
  t.after(async () => app.close());
  const alice = await authenticateByCode(app, "+15550009101");
  const bob = await authenticateByCode(app, "+15550009102");

  const chat = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${alice.token}`)
    .send({
      title: "Encrypted chat",
      participantIDs: [bob.userID],
    })
    .expect(201);

  await request(app.getHttpServer())
    .post(`/api/chats/${chat.body.id as string}/messages`)
    .set("Authorization", `Bearer ${alice.token}`)
    .send({
      messageID: "2a1ed4dd-95e8-48d8-bbd3-03590df01d31",
      kind: "text",
      text: "this plaintext must never be stored",
    })
    .expect(403);

  await request(app.getHttpServer())
    .get(`/api/chats/${chat.body.id as string}/messages`)
    .set("Authorization", `Bearer ${alice.token}`)
    .expect(403);
});

test("a protected chat rejects plaintext mutations after the global flag is disabled", async (t) => {
  const app = await createTestApp({ e2eeRequired: false });
  t.after(async () => app.close());
  const alice = await authenticateByCode(app, "+15550009111");
  const bob = await authenticateByCode(app, "+15550009112");
  const chat = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${alice.token}`)
    .send({ title: "Protected chat", participantIDs: [bob.userID] })
    .expect(201);
  const chatID = chat.body.id as string;
  const database = app.get(DataSource);
  await database
    .getRepository(ChatEntity)
    .update(chatID, { e2eeRequired: true });
  const messageID = randomUUID();

  await request(app.getHttpServer())
    .post(`/api/chats/${chatID}/messages`)
    .set("Authorization", `Bearer ${alice.token}`)
    .send({ messageID, kind: "text", text: "must never be persisted" })
    .expect(403);
  await request(app.getHttpServer())
    .patch(`/api/chats/${chatID}/messages/${messageID}`)
    .set("Authorization", `Bearer ${alice.token}`)
    .send({ text: "must never be edited" })
    .expect(403);
  await request(app.getHttpServer())
    .delete(`/api/chats/${chatID}/messages/${messageID}`)
    .set("Authorization", `Bearer ${alice.token}`)
    .expect(403);

  // Exercise the same service boundary used by WebSocket delivery.
  await t.test("realtime cannot bypass the stored chat policy", async () => {
    await assert.rejects(
      app.get(ChatService).addRealtimeMessage(
        chatID,
        {
          clientMessageId: randomUUID(),
          kind: MessageKind.TEXT,
          text: "secret",
        },
        { sub: alice.userID } as Parameters<
          ChatService["addRealtimeMessage"]
        >[2],
      ),
      { status: 403 },
    );
  });
  const count = await database
    .getRepository(MessageEntity)
    .countBy({ chatId: chatID });
  assert.equal(count, 0);
});
