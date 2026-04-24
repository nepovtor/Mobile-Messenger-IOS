import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";

describe("Mobile Messenger backend", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.PORT = "0";
    process.env.SQLITE_PATH = ":memory:";
    process.env.JWT_SECRET = "test-secret";
    process.env.AUTH_TEST_CODE = "123456";

    const { createApp } = await import("../src/app");
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(phone: string, code: string) {
    const response = await request(app.getHttpServer())
      .post("/api/auth/verify")
      .send({
        method: "phone",
        contact: phone,
        code,
      });

    expect(response.status).toBe(201);
    expect(response.body.phone).toBe(phone);

    return {
      token: response.body.token as string,
      userID: response.body.userID as string,
      displayName: response.body.displayName as string,
    };
  }

  function authed(token: string) {
    return (method: "get" | "post", path: string) =>
      request(app.getHttpServer())
        [method](path)
        .set("Authorization", `Bearer ${token}`);
  }

  it("responds with health and version metadata", async () => {
    const [healthResponse, versionResponse] = await Promise.all([
      request(app.getHttpServer()).get("/api/health"),
      request(app.getHttpServer()).get("/api/version"),
    ]);

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.status).toBe("ok");
    expect(typeof healthResponse.body.uptime).toBe("number");

    expect(versionResponse.status).toBe(200);
    expect(versionResponse.body.name).toBe("mobile-messenger-backend");
    expect(versionResponse.body.version).toBe("0.1.0");
  });

  it("Alex gets only his chats", async () => {
    const alex = await loginAs("+10000000001", "111111");

    const response = await authed(alex.token)("get", "/api/chats");

    expect(response.status).toBe(200);
    expect(response.body.map((chat: { title: string }) => chat.title)).toEqual(
      expect.arrayContaining([
        "Chat with Maria Stone",
        "Chat with Daniel Reed",
        "Study Group",
        "Backend Discussion",
      ]),
    );
    expect(response.body.map((chat: { title: string }) => chat.title)).not.toEqual(
      expect.arrayContaining(["Design Review", "Chat with Emily Brooks"]),
    );
  });

  it("Maria gets only her chats", async () => {
    const maria = await loginAs("+10000000002", "222222");

    const response = await authed(maria.token)("get", "/api/chats");

    expect(response.status).toBe(200);
    expect(response.body.map((chat: { title: string }) => chat.title)).toEqual(
      expect.arrayContaining([
        "Chat with Alex Carter",
        "Chat with Emily Brooks",
        "Study Group",
        "Design Review",
      ]),
    );
    expect(response.body.map((chat: { title: string }) => chat.title)).not.toEqual(
      expect.arrayContaining(["Backend Discussion", "Chat with Daniel Reed"]),
    );
  });

  it("Alex cannot access Emily private chat", async () => {
    const alex = await loginAs("+10000000001", "111111");
    const emily = await loginAs("+10000000004", "444444");
    const emilyChats = await authed(emily.token)("get", "/api/chats");
    const designReviewChat = emilyChats.body.find(
      (chat: { title: string }) => chat.title === "Design Review",
    );

    expect(designReviewChat).toBeDefined();

    const response = await authed(alex.token)(
      "get",
      `/api/chats/${designReviewChat.id}`,
    );

    expect(response.status).toBe(403);
  });

  it("participant can send a message and later fetch it from history", async () => {
    const alex = await loginAs("+10000000001", "111111");
    const alexChats = await authed(alex.token)("get", "/api/chats");
    const directChat = alexChats.body.find(
      (chat: { title: string }) => chat.title === "Chat with Maria Stone",
    );

    expect(directChat).toBeDefined();

    const messageID = randomUUID();
    const sendResponse = await authed(alex.token)(
      "post",
      `/api/chats/${directChat.id}/messages`,
    ).send({
      messageID,
      text: "Stable REST send from Alex",
    });

    expect(sendResponse.status).toBe(201);
    expect(sendResponse.body.id).toBe(messageID);
    expect(sendResponse.body.messageID).toBe(messageID);
    expect(sendResponse.body.chatID).toBe(directChat.id);
    expect(sendResponse.body.senderID).toBe(alex.userID);
    expect(sendResponse.body.status).toBe("sent");

    const historyResponse = await authed(alex.token)(
      "get",
      `/api/chats/${directChat.id}/messages`,
    );

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: messageID,
          messageID,
          chatID: directChat.id,
          senderID: alex.userID,
          text: "Stable REST send from Alex",
        }),
      ]),
    );
  });

  it("non-participant cannot send a message", async () => {
    const daniel = await loginAs("+10000000003", "333333");
    const emily = await loginAs("+10000000004", "444444");
    const emilyChats = await authed(emily.token)("get", "/api/chats");
    const designReviewChat = emilyChats.body.find(
      (chat: { title: string }) => chat.title === "Design Review",
    );

    expect(designReviewChat).toBeDefined();

    const response = await authed(daniel.token)(
      "post",
      `/api/chats/${designReviewChat.id}/messages`,
    ).send({
      messageID: randomUUID(),
      text: "I should not be able to send this",
    });

    expect(response.status).toBe(403);
  });
});
