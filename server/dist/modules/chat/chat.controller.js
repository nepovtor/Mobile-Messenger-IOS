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
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const chat_service_1 = require("./chat.service");
const create_chat_dto_1 = require("./dto/create-chat.dto");
const send_message_dto_1 = require("./dto/send-message.dto");
const set_typing_dto_1 = require("./dto/set-typing.dto");
let ChatController = class ChatController {
    constructor(chatService) {
        this.chatService = chatService;
    }
    createChat(dto, user) {
        return this.chatService.createChat(dto, user);
    }
    listChats(user, search) {
        return this.chatService.listChats(user.sub, search);
    }
    getMessages(chatID, user, limit, before) {
        let parsedLimit;
        if (limit !== undefined) {
            parsedLimit = Number(limit);
            if (!Number.isInteger(parsedLimit)) {
                throw new common_1.BadRequestException("Validation failed (numeric string is expected)");
            }
        }
        return this.chatService.getMessages(chatID, user.sub, parsedLimit, before);
    }
    addMessage(chatID, dto, user) {
        return this.chatService.addMessage(chatID, dto, user);
    }
    markRead(chatID, messageID, user) {
        return this.chatService.markRead(chatID, messageID, user);
    }
    setTyping(chatID, dto, user) {
        return this.chatService.setTyping(chatID, dto, user);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_chat_dto_1.CreateChatDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "createChat", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)("search")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listChats", null);
__decorate([
    (0, common_1.Get)(":chatID/messages"),
    __param(0, (0, common_1.Param)("chatID", new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)("limit")),
    __param(3, (0, common_1.Query)("before")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)(":chatID/messages"),
    __param(0, (0, common_1.Param)("chatID", new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_message_dto_1.SendMessageDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "addMessage", null);
__decorate([
    (0, common_1.Post)(":chatID/messages/:messageID/read"),
    __param(0, (0, common_1.Param)("chatID", new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)("messageID", new common_1.ParseUUIDPipe())),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markRead", null);
__decorate([
    (0, common_1.Post)(":chatID/typing"),
    __param(0, (0, common_1.Param)("chatID", new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, set_typing_dto_1.SetTypingDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "setTyping", null);
exports.ChatController = ChatController = __decorate([
    (0, common_1.Controller)("chats"),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map