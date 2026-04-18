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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../jwt-auth.guard");
const chat_events_service_1 = require("./chat-events.service");
const chat_service_1 = require("./chat.service");
const create_chat_dto_1 = require("./dto/create-chat.dto");
const mark_chat_read_dto_1 = require("./dto/mark-chat-read.dto");
const send_message_dto_1 = require("./dto/send-message.dto");
const update_typing_dto_1 = require("./dto/update-typing.dto");
let ChatController = class ChatController {
    constructor(chatService, chatEventsService) {
        this.chatService = chatService;
        this.chatEventsService = chatEventsService;
    }
    listChats(request) {
        return this.chatService.listChats(request.user.sub);
    }
    getChat(chatId, request) {
        return this.chatService.getChat(chatId, request.user.sub);
    }
    async streamChatEvents(chatId, request) {
        const chat = await this.chatService.getChat(chatId, request.user.sub);
        return this.chatEventsService.subscribe(chatId.toLowerCase(), request.user.sub, chat);
    }
    getMessages(chatId, request) {
        return this.chatService.getMessages(chatId, request.user.sub);
    }
    sendMessage(chatId, body, request) {
        return this.chatService.addMessage(chatId, body, request.user.sub);
    }
    createChat(body, request) {
        return this.chatService.createChat(body, request.user.sub);
    }
    markChatRead(chatId, body, request) {
        return this.chatService.markChatRead(chatId, request.user.sub, body.messageID);
    }
    markMessageRead(chatId, messageID, request) {
        return this.chatService.markChatRead(chatId, request.user.sub, messageID);
    }
    updateTyping(chatId, body, request) {
        return this.chatService.setTyping(chatId, request.user.sub, body.isTyping);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listChats", null);
__decorate([
    (0, common_1.Get)(":chatId"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getChat", null);
__decorate([
    (0, common_1.Sse)(":chatId/events"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "streamChatEvents", null);
__decorate([
    (0, common_1.Get)(":chatId/messages"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)(":chatId/messages"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_message_dto_1.SendMessageDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_chat_dto_1.CreateChatDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "createChat", null);
__decorate([
    (0, common_1.Post)(":chatId/read"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, mark_chat_read_dto_1.MarkChatReadDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markChatRead", null);
__decorate([
    (0, common_1.Post)(":chatId/messages/:messageID/read"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Param)("messageID")),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markMessageRead", null);
__decorate([
    (0, common_1.Post)(":chatId/typing"),
    __param(0, (0, common_1.Param)("chatId")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_typing_dto_1.UpdateTypingDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "updateTyping", null);
exports.ChatController = ChatController = __decorate([
    (0, common_1.Controller)("chats"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [chat_service_1.ChatService,
        chat_events_service_1.ChatEventsService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map