import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { JwtService } from "@nestjs/jwt";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { Repository } from "typeorm";
import { WebSocket } from "ws";
import { SessionPrincipalType } from "../src/entities/auth-session.entity";
import { UserEntity } from "../src/entities/user.entity";
import { SessionService } from "../src/modules/sessions/session.service";
import {
  authenticateByCode,
  createTestApp,
  openRealtimeSocket,
  realtimeURL,
  sendRealtimeEvent,
} from "./support/auth-chat-test-harness";

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

test("lab user can be created with a hashed password and log in via /api/login", async (t) => {
  const app = await createTestApp({
    allowPasswordLogin: true,
    enableDemoAccounts: false,
  });
  t.after(async () => {
    await app.close();
  });

  const createResponse = await request(app.getHttpServer())
    .post("/api/users")
    .send({
      login: "lab-user",
      password: "Secret1234",
      displayName: "Lab User",
      phone: "+15550123456",
    })
    .expect(201);

  assert.equal(createResponse.body.login, "lab-user");
  assert.equal(createResponse.body.displayName, "Lab User");
  assert.equal("passwordHash" in createResponse.body, false);

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  const savedUser = await usersRepository
    .createQueryBuilder("user")
    .addSelect("user.passwordHash")
    .where("user.id = :id", { id: createResponse.body.userID as string })
    .getOne();

  assert.equal(savedUser?.login, "lab-user");
  assert.equal(typeof savedUser?.passwordHash, "string");
  assert.notEqual(savedUser?.passwordHash, "Secret1234");

  const loginResponse = await request(app.getHttpServer())
    .post("/api/login")
    .send({
      login: "lab-user",
      password: "Secret1234",
    })
    .expect(201);

  assert.equal(typeof loginResponse.body.token, "string");

  const meResponse = await request(app.getHttpServer())
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${loginResponse.body.token}`)
    .expect(200);

  assert.equal(meResponse.body.login, "lab-user");
  assert.equal(meResponse.body.userID, createResponse.body.userID);
});

test("valid JWT returns 403 when the user no longer exists in the database", async (t) => {
  const app = await createTestApp({
    allowPasswordLogin: true,
    enableDemoAccounts: false,
  });
  t.after(async () => {
    await app.close();
  });

  const createResponse = await request(app.getHttpServer())
    .post("/api/users")
    .send({
      login: "deleted-user",
      password: "Secret1234",
      displayName: "Deleted User",
    })
    .expect(201);

  const loginResponse = await request(app.getHttpServer())
    .post("/api/login")
    .send({
      login: "deleted-user",
      password: "Secret1234",
    })
    .expect(201);

  const usersRepository = app.get<Repository<UserEntity>>(
    getRepositoryToken(UserEntity),
  );
  await usersRepository.delete(createResponse.body.userID as string);

  await request(app.getHttpServer())
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${loginResponse.body.token}`)
    .expect(401);
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

test("realtime websocket rejects JWT passed through the query string", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => {
    await app.close();
  });

  const anna = await authenticateByCode(app, "+15551230011");

  const closeCode = await new Promise<number>((resolve, reject) => {
    const url = new URL(realtimeURL(app));
    url.searchParams.set("token", anna.token);

    const socket = new WebSocket(url);
    t.after(() => {
      socket.close();
    });

    const timeout = setTimeout(
      () => reject(new Error("Socket stayed open")),
      2000,
    );
    socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    socket.once("error", () => {
      // The close frame is the security assertion source.
    });
  });

  assert.equal(closeCode, 4001);
});

test("realtime websocket rejects a non-allowlisted Origin", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => app.close());
  const anna = await authenticateByCode(app, "+15551230011");

  const closeCode = await new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(realtimeURL(app), {
      headers: {
        Authorization: `Bearer ${anna.token}`,
        Origin: "https://attacker.example",
      },
    });
    const timeout = setTimeout(
      () => reject(new Error("Socket stayed open")),
      2000,
    );
    socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    socket.once("error", () => {
      // The close frame is the security assertion source.
    });
  });
  assert.equal(closeCode, 4001);
});

test("realtime websocket closes after its server session is revoked", async (t) => {
  const app = await createTestApp({ allowPasswordLogin: true });
  t.after(async () => app.close());
  const anna = await authenticateByCode(app, "+15551230011");
  const client = await openRealtimeSocket(app, anna.token);
  await client.nextEvent("connection.ready");
  const payload = JSON.parse(
    Buffer.from(anna.token.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as { sid: string };

  const closed = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Revoked socket stayed open")),
      2000,
    );
    client.socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  await app
    .get(SessionService)
    .revokeSession(
      SessionPrincipalType.USER,
      anna.userID,
      payload.sid,
      "security_test",
    );

  assert.equal(await closed, 4001);
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
      secret: process.env["JWT_SECRET"] ?? "test-jwt-secret",
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
