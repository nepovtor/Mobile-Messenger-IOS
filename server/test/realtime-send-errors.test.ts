import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import request from "supertest";
import {
  authenticateByCode,
  createTestApp,
  openRealtimeSocket,
  sendRealtimeEvent,
} from "./support/auth-chat-test-harness";

test("invalid message content returns a correlated failure and preserves the socket", async (t) => {
  const app = await createTestApp();
  t.after(async () => app.close());
  const alice = await authenticateByCode(app, "+15550009981");
  const chat = await request(app.getHttpServer())
    .post("/api/chats")
    .set("Authorization", `Bearer ${alice.token}`)
    .send({ title: "Validation" })
    .expect(201);
  const connection = await openRealtimeSocket(app, alice.token);
  t.after(() => connection.socket.close());
  await connection.nextEvent("connection.ready");
  const invalidID = randomUUID();
  sendRealtimeEvent(connection.socket, "message.send", {
    chatID: chat.body.id as string,
    clientMessageId: invalidID,
    kind: "text",
    text: "x".repeat(4_001),
  });
  const failure = await connection.nextEvent<{
    clientMessageId: string;
    reason: string;
  }>("message.failed");
  assert.equal(failure.data.clientMessageId, invalidID);
  assert.equal(failure.data.reason, "Invalid payload");

  const validID = randomUUID();
  sendRealtimeEvent(connection.socket, "message.send", {
    chatID: chat.body.id as string,
    clientMessageId: validID,
    kind: "text",
    text: "Valid message",
  });
  const ack = await connection.nextEvent<{ clientMessageId: string }>(
    "message.send.ack",
  );
  assert.equal(ack.data.clientMessageId, validID);
});
