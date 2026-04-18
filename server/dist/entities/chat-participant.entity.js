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
exports.ChatParticipantEntity = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const chat_entity_1 = require("./chat.entity");
const user_entity_1 = require("./user.entity");
let ChatParticipantEntity = class ChatParticipantEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.ChatParticipantEntity = ChatParticipantEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], ChatParticipantEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "chat_id", type: "uuid" }),
    __metadata("design:type", String)
], ChatParticipantEntity.prototype, "chatId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => chat_entity_1.ChatEntity, (chat) => chat.participants, {
        onDelete: "CASCADE",
    }),
    (0, typeorm_1.JoinColumn)({ name: "chat_id" }),
    __metadata("design:type", chat_entity_1.ChatEntity)
], ChatParticipantEntity.prototype, "chat", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "user_id", type: "uuid" }),
    __metadata("design:type", String)
], ChatParticipantEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, (user) => user.chatParticipants, {
        onDelete: "CASCADE",
    }),
    (0, typeorm_1.JoinColumn)({ name: "user_id" }),
    __metadata("design:type", user_entity_1.UserEntity)
], ChatParticipantEntity.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "last_read_message_id", type: "uuid", nullable: true }),
    __metadata("design:type", Object)
], ChatParticipantEntity.prototype, "lastReadMessageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "last_read_at", type: "timestamptz", nullable: true }),
    __metadata("design:type", Object)
], ChatParticipantEntity.prototype, "lastReadAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "joined_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], ChatParticipantEntity.prototype, "joinedAt", void 0);
exports.ChatParticipantEntity = ChatParticipantEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "chat_participants" }),
    (0, typeorm_1.Unique)("uq_chat_participants_chat_user", ["chatId", "userId"])
], ChatParticipantEntity);
//# sourceMappingURL=chat-participant.entity.js.map