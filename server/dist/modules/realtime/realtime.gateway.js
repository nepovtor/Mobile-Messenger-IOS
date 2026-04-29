"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RealtimeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const websockets_1 = require("@nestjs/websockets");
const node_url_1 = require("node:url");
const runtime_config_1 = require("../common/runtime-config");
const chat_service_1 = require("../chat/chat.service");
const realtime_service_1 = require("./realtime.service");
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    constructor(jwtService, realtimeService, chatService) {
        this.jwtService = jwtService;
        this.realtimeService = realtimeService;
        this.chatService = chatService;
        this.logger = new common_1.Logger(RealtimeGateway_1.name);
    }
    handleConnection(client, request) {
        const user = this.authenticate(request);
        if (!user) {
            client.close(4001, "Unauthorized");
            return;
        }
        client.user = user;
        this.realtimeService.registerConnection(user.sub, client);
        this.realtimeService.sendToUser(user.sub, {
            event: "connection.ready",
            data: {
                userID: user.sub,
            },
        });
        this.logger.log(`Realtime connected user=${user.sub}`);
    }
    handleDisconnect(client) {
        const userID = client.user?.sub;
        if (!userID) {
            return;
        }
        this.realtimeService.unregisterConnection(userID, client);
        this.logger.log(`Realtime disconnected user=${userID}`);
    }
    async handleMessageSend(client, body) {
        const user = this.requireUser(client);
        try {
            const message = await this.chatService.addRealtimeMessage(body.chatID, body, user);
            return {
                event: "message.send.ack",
                data: {
                    chatID: body.chatID,
                    clientMessageId: body.clientMessageId,
                    message,
                },
            };
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : "Failed to send message";
            this.realtimeService.sendToUser(user.sub, {
                event: "message.failed",
                data: {
                    chatID: body.chatID,
                    clientMessageId: body.clientMessageId,
                    reason,
                },
            });
            return {
                event: "message.failed",
                data: {
                    chatID: body.chatID,
                    clientMessageId: body.clientMessageId,
                    reason,
                },
            };
        }
    }
    async handleTypingStarted(client, body) {
        const user = this.requireUser(client);
        return {
            event: "typing.started",
            data: await this.chatService.setRealtimeTyping(body.chatID, { isTyping: true }, user),
        };
    }
    async handleTypingStopped(client, body) {
        const user = this.requireUser(client);
        return {
            event: "typing.stopped",
            data: await this.chatService.setRealtimeTyping(body.chatID, { isTyping: false }, user),
        };
    }
    async handleMessageRead(client, body) {
        const user = this.requireUser(client);
        await this.chatService.markRead(body.chatID, body.messageID, user);
        return {
            event: "message.read.ack",
            data: {
                chatID: body.chatID,
                messageID: body.messageID,
            },
        };
    }
    requireUser(client) {
        if (!client.user) {
            throw new Error("Unauthorized");
        }
        return client.user;
    }
    authenticate(request) {
        const authorizationHeader = request.headers.authorization;
        const header = Array.isArray(authorizationHeader)
            ? authorizationHeader[0]
            : authorizationHeader;
        const tokenFromQuery = this.extractTokenFromQuery(request);
        const bearerToken = header?.startsWith("Bearer ")
            ? header.slice(7)
            : tokenFromQuery;
        if (!bearerToken) {
            return null;
        }
        try {
            return this.jwtService.verify(bearerToken, {
                secret: (0, runtime_config_1.getJwtSecret)(),
            });
        }
        catch {
            return null;
        }
    }
    extractTokenFromQuery(request) {
        if (!request.url) {
            return null;
        }
        try {
            const url = new node_url_1.URL(request.url, "http://localhost");
            return url.searchParams.get("token");
        }
        catch {
            return null;
        }
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.SubscribeMessage)("message.send"),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "handleMessageSend", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("typing.started"),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "handleTypingStarted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("typing.stopped"),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "handleTypingStopped", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("message.read"),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "handleMessageRead", null);
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        path: "/realtime",
        cors: false,
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        realtime_service_1.RealtimeService,
        chat_service_1.ChatService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map