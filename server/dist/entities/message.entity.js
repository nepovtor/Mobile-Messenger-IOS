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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageEntity = exports.MessageKind = exports.MessageStatus = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const chat_entity_1 = require("./chat.entity");
const media_entity_1 = require("./media.entity");
const user_entity_1 = require("./user.entity");
var MessageStatus;
(function (MessageStatus) {
    MessageStatus["SENDING"] = "sending";
    MessageStatus["SENT"] = "sent";
    MessageStatus["DELIVERED"] = "delivered";
    MessageStatus["READ"] = "read";
    MessageStatus["FAILED"] = "failed";
})(MessageStatus || (exports.MessageStatus = MessageStatus = {}));
var MessageKind;
(function (MessageKind) {
    MessageKind["TEXT"] = "text";
    MessageKind["IMAGE"] = "image";
})(MessageKind || (exports.MessageKind = MessageKind = {}));
let MessageEntity = class MessageEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.MessageEntity = MessageEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], MessageEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "chat_id", type: "uuid" }),
    __metadata("design:type", String)
], MessageEntity.prototype, "chatId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => chat_entity_1.ChatEntity, (chat) => chat.messages, { onDelete: "CASCADE" }),
    (0, typeorm_1.JoinColumn)({ name: "chat_id" }),
    __metadata("design:type", chat_entity_1.ChatEntity)
], MessageEntity.prototype, "chat", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "author_id", type: "uuid" }),
    __metadata("design:type", String)
], MessageEntity.prototype, "authorId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, (user) => user.messages, { onDelete: "CASCADE" }),
    (0, typeorm_1.JoinColumn)({ name: "author_id" }),
    __metadata("design:type", user_entity_1.UserEntity)
], MessageEntity.prototype, "author", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "client_message_id", type: "uuid" }),
    __metadata("design:type", String)
], MessageEntity.prototype, "clientMessageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "simple-enum", enum: MessageKind, default: MessageKind.TEXT }),
    __metadata("design:type", String)
], MessageEntity.prototype, "kind", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], MessageEntity.prototype, "text", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "media_id", type: "uuid", nullable: true }),
    __metadata("design:type", Object)
], MessageEntity.prototype, "mediaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => media_entity_1.MediaEntity, (media) => media.messages, {
        onDelete: "SET NULL",
        nullable: true,
    }),
    (0, typeorm_1.JoinColumn)({ name: "media_id" }),
    __metadata("design:type", Object)
], MessageEntity.prototype, "media", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "simple-enum",
        enum: MessageStatus,
        default: MessageStatus.SENT,
    }),
    __metadata("design:type", String)
], MessageEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "created_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], MessageEntity.prototype, "createdAt", void 0);
exports.MessageEntity = MessageEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "messages" })
], MessageEntity);
//# sourceMappingURL=message.entity.js.map