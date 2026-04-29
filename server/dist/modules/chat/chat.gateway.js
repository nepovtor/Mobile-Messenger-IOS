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
var ChatGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const socket_io_1 = require("socket.io");
const chat_service_1 = require("./chat.service");
const send_realtime_message_dto_1 = require("./dto/send-realtime-message.dto");
let ChatGateway = ChatGateway_1 = class ChatGateway {
    constructor(chatService, jwtService) {
        this.chatService = chatService;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(ChatGateway_1.name);
    }
    handleConnection(client) {
        const user = this.authenticateClient(client);
        if (!user) {
            client.emit("error", { message: "Unauthorized" });
            client.disconnect();
            return;
        }
        client.data.user = user;
        this.logger.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }
    handleJoinChat(chatId, client) {
        client.join(chatId);
        this.logger.log(`Client ${client.id} joined chat ${chatId}`);
    }
    handleLeaveChat(chatId, client) {
        client.leave(chatId);
        this.logger.log(`Client ${client.id} left chat ${chatId}`);
    }
    async handleSendMessage(data, client) {
        const user = client.data.user;
        if (!user) {
            client.emit("error", { message: "Unauthorized" });
            client.disconnect();
            return;
        }
        try {
            const message = await this.chatService.addMessage(data.chatId, {
                messageID: data.messageID,
                kind: data.kind,
                text: data.text,
                mediaID: data.mediaID,
            }, user);
            client.to(data.chatId).emit("newMessage", message);
            client.emit("messageSent", message);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to send message";
            client.emit("error", { message });
        }
    }
    authenticateClient(client) {
        const authToken = client.handshake.auth.token;
        const authorizationHeader = client.handshake.headers.authorization;
        const bearerToken = typeof authToken === "string"
            ? authToken
            : typeof authorizationHeader === "string" &&
                authorizationHeader.startsWith("Bearer ")
                ? authorizationHeader.substring(7)
                : null;
        if (!bearerToken) {
            return null;
        }
        try {
            return this.jwtService.verify(bearerToken);
        }
        catch {
            return null;
        }
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.SubscribeMessage)("joinChat"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleJoinChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("leaveChat"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleLeaveChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("sendMessage"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_realtime_message_dto_1.SendRealtimeMessageDto,
        socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSendMessage", null);
exports.ChatGateway = ChatGateway = ChatGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: "*",
        },
    }),
    __metadata("design:paramtypes", [chat_service_1.ChatService,
        jwt_1.JwtService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map