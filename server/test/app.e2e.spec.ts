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
    const authenticate = async (contact: string, displayName: string) => {
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
          displayName,
        });

      expect(verifyCodeResponse.status).toBe(201);
      expect(verifyCodeResponse.body.displayName).toBe(displayName);

      return {
        token: verifyCodeResponse.body.token as string,
        userID: verifyCodeResponse.body.userID as string,
      };
    };

    const createAuthedRequest = (token: string) => (
      method: "get" | "post",
      path: string,
    ) =>
      request(app.getHttpServer())[method](path).set(
        "Authorization",
        `Bearer ${token}`,
      );

    const primaryUser = await authenticate("+15551230001", "README Smoke");
    const secondaryUser = await authenticate("+15551230002", "README Reader");
    const withPrimaryAuth = createAuthedRequest(primaryUser.token);
    const withSecondaryAuth = createAuthedRequest(secondaryUser.token);

    const chatsResponse = await withPrimaryAuth("get", "/api/chats");
    expect(chatsResponse.status).toBe(200);
    expect(chatsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "General Chat",
          unreadCount: 0,
          typingParticipants: [],
        }),
      ]),
    );

    const createChatResponse = await withPrimaryAuth("post", "/api/chats").send({
      title: "README Test Chat",
      participantIds: [secondaryUser.userID],
    });

    expect(createChatResponse.status).toBe(201);
    expect(createChatResponse.body.title).toBe("README Test Chat");
    expect(createChatResponse.body.unreadCount).toBe(0);
    expect(createChatResponse.body.typingParticipants).toEqual([]);

    const chatID = createChatResponse.body.id as string;
    const messageID = randomUUID();

    const sendMessageResponse = await withPrimaryAuth(
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

    const duplicateSendResponse = await withPrimaryAuth(
      "post",
      `/api/chats/${chatID}/messages`,
    )
      .send({
        text: "Hello from automated README smoke test",
        messageID,
      });

    expect(duplicateSendResponse.status).toBe(201);
    expect(duplicateSendResponse.body.id).toBe(sendMessageResponse.body.id);

    const chatForReaderResponse = await withSecondaryAuth(
      "get",
      `/api/chats/${chatID}`,
    );
    expect(chatForReaderResponse.status).toBe(200);
    expect(chatForReaderResponse.body.unreadCount).toBe(1);
    expect(chatForReaderResponse.body.typingParticipants).toEqual([]);

    const typingStartedResponse = await withSecondaryAuth(
      "post",
      `/api/chats/${chatID}/typing`,
    ).send({
      isTyping: true,
    });
    expect(typingStartedResponse.status).toBe(201);

    const chatWhileTypingResponse = await withPrimaryAuth(
      "get",
      `/api/chats/${chatID}`,
    );
    expect(chatWhileTypingResponse.status).toBe(200);
    expect(chatWhileTypingResponse.body.typingParticipants).toEqual([
      "README Reader",
    ]);

    const typingStoppedResponse = await withSecondaryAuth(
      "post",
      `/api/chats/${chatID}/typing`,
    ).send({
      isTyping: false,
    });
    expect(typingStoppedResponse.status).toBe(201);

    const markReadResponse = await withSecondaryAuth(
      "post",
      `/api/chats/${chatID}/read`,
    ).send({
      messageID,
    });
    expect(markReadResponse.status).toBe(201);
    expect(markReadResponse.body.unreadCount).toBe(0);

    const messagesResponse = await withPrimaryAuth(
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
          status: "read",
        }),
      ]),
    );
  });

  it("supports demo password login and exposes demo contacts", async () => {
    const signInWithPassword = async (contact: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post("/api/auth/password-login")
        .send({
          method: "phone",
          contact,
          password,
        });

      expect(response.status).toBe(201);

      return {
        token: response.body.token as string,
        userID: response.body.userID as string,
        displayName: response.body.displayName as string,
      };
    };

    const createAuthedRequest = (token: string) => (
      method: "get" | "post",
      path: string,
    ) =>
      request(app.getHttpServer())[method](path).set(
        "Authorization",
        `Bearer ${token}`,
      );

    const anna = await signInWithPassword("+15551230011", "demo1111");
    const boris = await signInWithPassword("+15551230012", "demo2222");
    const withAnnaAuth = createAuthedRequest(anna.token);
    const withBorisAuth = createAuthedRequest(boris.token);

    const contactsResponse = await withAnnaAuth("get", "/api/auth/contacts");
    expect(contactsResponse.status).toBe(200);
    expect(contactsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Анна Demo",
          phone: "+15551230011",
          isCurrentUser: true,
        }),
        expect.objectContaining({
          displayName: "Борис Demo",
          phone: "+15551230012",
          isCurrentUser: false,
        }),
      ]),
    );

    const createChatResponse = await withAnnaAuth("post", "/api/chats").send({
      title: "Demo direct chat",
      participantIds: [boris.userID],
      isDirect: true,
    });

    expect(createChatResponse.status).toBe(201);
    expect(createChatResponse.body.title).toBe("Борис Demo");

    const sameChatResponse = await withBorisAuth("post", "/api/chats").send({
      title: "Demo direct chat",
      participantIds: [anna.userID],
      isDirect: true,
    });

    expect(sameChatResponse.status).toBe(201);
    expect(sameChatResponse.body.id).toBe(createChatResponse.body.id);
    expect(sameChatResponse.body.title).toBe("Анна Demo");
  });
});
