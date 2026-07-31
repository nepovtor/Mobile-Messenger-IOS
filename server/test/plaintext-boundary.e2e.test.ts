import "reflect-metadata";
import test from "node:test";
import request from "supertest";
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
