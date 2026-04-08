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

  it("supports the README auth and chat flow", async () => {
    const contact = "+15551230001";

    const requestCodeResponse = await request(app.getHttpServer())
      .post("/api/auth/request")
      .send({
        method: "phone",
        contact,
      });

    expect(requestCodeResponse.status).toBe(201);
    expect(requestCodeResponse.body.expiresIn).toBe(300);

    const verifyCodeResponse = await request(app.getHttpServer())
      .post("/api/auth/verify")
      .send({
        method: "phone",
        contact,
        code: "123456",
        displayName: "README Smoke",
      });

    expect(verifyCodeResponse.status).toBe(201);
    expect(verifyCodeResponse.body.displayName).toBe("README Smoke");

    const token = verifyCodeResponse.body.token as string;
    const withAuth = (
      method: "get" | "post",
      path: string,
    ) => request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);

    const chatsResponse = await withAuth("get", "/api/chats");
    expect(chatsResponse.status).toBe(200);
    expect(chatsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "General Chat",
        }),
      ]),
    );

    const createChatResponse = await withAuth("post", "/api/chats").send({
      title: "README Test Chat",
      participantIds: [],
    });

    expect(createChatResponse.status).toBe(201);
    expect(createChatResponse.body.title).toBe("README Test Chat");

    const chatID = createChatResponse.body.id as string;
    const messageID = randomUUID();

    const sendMessageResponse = await withAuth(
      "post",
      `/api/chats/${chatID}/messages`,
    )
      .send({
        text: "Hello from automated README smoke test",
        messageID,
      });

    expect(sendMessageResponse.status).toBe(201);
    expect(sendMessageResponse.body.messageID).toBe(messageID);
    expect(sendMessageResponse.body.text).toBe(
      "Hello from automated README smoke test",
    );

    const messagesResponse = await withAuth(
      "get",
      `/api/chats/${chatID}/messages`,
    );

    expect(messagesResponse.status).toBe(200);
    expect(messagesResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageID,
          text: "Hello from automated README smoke test",
          authorName: "README Smoke",
        }),
      ]),
    );
  });
});
