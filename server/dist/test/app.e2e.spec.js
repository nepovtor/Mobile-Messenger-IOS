"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const supertest_1 = __importDefault(require("supertest"));
describe("Mobile Messenger backend", () => {
    let app;
    beforeAll(async () => {
        process.env.NODE_ENV = "test";
        process.env.PORT = "0";
        process.env.SQLITE_PATH = ":memory:";
        process.env.JWT_SECRET = "test-secret";
        process.env.AUTH_TEST_CODE = "123456";
        const { createApp } = await Promise.resolve().then(() => __importStar(require("../src/app")));
        app = await createApp();
        await app.init();
    });
    afterAll(async () => {
        await app.close();
    });
    it("responds with health and version metadata", async () => {
        const [healthResponse, versionResponse] = await Promise.all([
            (0, supertest_1.default)(app.getHttpServer()).get("/api/health"),
            (0, supertest_1.default)(app.getHttpServer()).get("/api/version"),
        ]);
        expect(healthResponse.status).toBe(200);
        expect(healthResponse.body.status).toBe("ok");
        expect(typeof healthResponse.body.uptime).toBe("number");
        expect(versionResponse.status).toBe(200);
        expect(versionResponse.body.name).toBe("mobile-messenger-backend");
        expect(versionResponse.body.version).toBe("0.1.0");
    });
    it("supports the README auth and chat flow", async () => {
        const authenticate = async (contact, displayName) => {
            const requestCodeResponse = await (0, supertest_1.default)(app.getHttpServer())
                .post("/api/auth/request")
                .send({
                method: "phone",
                contact,
            });
            expect(requestCodeResponse.status).toBe(201);
            expect(requestCodeResponse.body.expiresIn).toBe(300);
            const verifyCodeResponse = await (0, supertest_1.default)(app.getHttpServer())
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
                token: verifyCodeResponse.body.token,
                userID: verifyCodeResponse.body.userID,
            };
        };
        const createAuthedRequest = (token) => (method, path) => (0, supertest_1.default)(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);
        const primaryUser = await authenticate("+15551230001", "README Smoke");
        const secondaryUser = await authenticate("+15551230002", "README Reader");
        const withPrimaryAuth = createAuthedRequest(primaryUser.token);
        const withSecondaryAuth = createAuthedRequest(secondaryUser.token);
        const chatsResponse = await withPrimaryAuth("get", "/api/chats");
        expect(chatsResponse.status).toBe(200);
        expect(chatsResponse.body).toEqual(expect.arrayContaining([
            expect.objectContaining({
                title: "General Chat",
                unreadCount: 0,
                typingParticipants: [],
            }),
        ]));
        const createChatResponse = await withPrimaryAuth("post", "/api/chats").send({
            title: "README Test Chat",
            participantIds: [secondaryUser.userID],
        });
        expect(createChatResponse.status).toBe(201);
        expect(createChatResponse.body.title).toBe("README Test Chat");
        expect(createChatResponse.body.unreadCount).toBe(0);
        expect(createChatResponse.body.typingParticipants).toEqual([]);
        const chatID = createChatResponse.body.id;
        const messageID = (0, node_crypto_1.randomUUID)();
        const imageMessageID = (0, node_crypto_1.randomUUID)();
        const sendMessageResponse = await withPrimaryAuth("post", `/api/chats/${chatID}/messages`)
            .send({
            text: "Hello from automated README smoke test",
            messageID,
        });
        expect(sendMessageResponse.status).toBe(201);
        expect(sendMessageResponse.body.messageID).toBe(messageID);
        expect(sendMessageResponse.body.text).toBe("Hello from automated README smoke test");
        const duplicateSendResponse = await withPrimaryAuth("post", `/api/chats/${chatID}/messages`)
            .send({
            text: "Hello from automated README smoke test",
            messageID,
        });
        expect(duplicateSendResponse.status).toBe(201);
        expect(duplicateSendResponse.body.id).toBe(sendMessageResponse.body.id);
        const chatForReaderResponse = await withSecondaryAuth("get", `/api/chats/${chatID}`);
        expect(chatForReaderResponse.status).toBe(200);
        expect(chatForReaderResponse.body.unreadCount).toBe(1);
        expect(chatForReaderResponse.body.typingParticipants).toEqual([]);
        const typingStartedResponse = await withSecondaryAuth("post", `/api/chats/${chatID}/typing`).send({
            isTyping: true,
        });
        expect(typingStartedResponse.status).toBe(201);
        const chatWhileTypingResponse = await withPrimaryAuth("get", `/api/chats/${chatID}`);
        expect(chatWhileTypingResponse.status).toBe(200);
        expect(chatWhileTypingResponse.body.typingParticipants).toEqual([
            "README Reader",
        ]);
        const typingStoppedResponse = await withSecondaryAuth("post", `/api/chats/${chatID}/typing`).send({
            isTyping: false,
        });
        expect(typingStoppedResponse.status).toBe(201);
        const markReadResponse = await withSecondaryAuth("post", `/api/chats/${chatID}/read`).send({
            messageID,
        });
        expect(markReadResponse.status).toBe(201);
        expect(markReadResponse.body.unreadCount).toBe(0);
        const uploadTargetResponse = await withPrimaryAuth("post", "/api/media/upload-url").send({
            mimeType: "image/jpeg",
            sizeBytes: 4,
            width: 1,
            height: 1,
        });
        expect(uploadTargetResponse.status).toBe(201);
        const mediaID = uploadTargetResponse.body.mediaID;
        const uploadBinaryResponse = await (0, supertest_1.default)(app.getHttpServer())
            .put(`/api/media/upload/${mediaID}`)
            .set("Content-Type", "image/jpeg")
            .send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
        expect(uploadBinaryResponse.status).toBe(200);
        expect(typeof uploadBinaryResponse.header.etag).toBe("string");
        const confirmUploadResponse = await withPrimaryAuth("post", `/api/media/${mediaID}/confirm`).send({
            etag: uploadBinaryResponse.header.etag,
        });
        expect(confirmUploadResponse.status).toBe(201);
        expect(confirmUploadResponse.body.mediaID).toBe(mediaID);
        const sendImageMessageResponse = await withPrimaryAuth("post", `/api/chats/${chatID}/messages`).send({
            messageID: imageMessageID,
            kind: "image",
            text: "Фото из smoke test",
            mediaID,
        });
        expect(sendImageMessageResponse.status).toBe(201);
        expect(sendImageMessageResponse.body.kind).toBe("image");
        expect(sendImageMessageResponse.body.mediaID).toBe(mediaID);
        expect(sendImageMessageResponse.body.mediaURL).toContain(`/api/media/${mediaID}`);
        const downloadImageResponse = await (0, supertest_1.default)(app.getHttpServer()).get(`/api/media/${mediaID}`);
        expect(downloadImageResponse.status).toBe(200);
        expect(downloadImageResponse.header["content-type"]).toContain("image/jpeg");
        const messagesResponse = await withPrimaryAuth("get", `/api/chats/${chatID}/messages`);
        expect(messagesResponse.status).toBe(200);
        expect(messagesResponse.body).toEqual(expect.arrayContaining([
            expect.objectContaining({
                messageID,
                text: "Hello from automated README smoke test",
                authorName: "README Smoke",
                status: "read",
            }),
            expect.objectContaining({
                messageID: imageMessageID,
                kind: "image",
                mediaID,
                text: "Фото из smoke test",
            }),
        ]));
    });
});
//# sourceMappingURL=app.e2e.spec.js.map