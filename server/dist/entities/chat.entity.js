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
exports.ChatEntity = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const chat_participant_entity_1 = require("./chat-participant.entity");
const message_entity_1 = require("./message.entity");
let ChatEntity = class ChatEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.ChatEntity = ChatEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], ChatEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar" }),
    __metadata("design:type", String)
], ChatEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "last_message_preview", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], ChatEntity.prototype, "lastMessagePreview", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: "last_activity",
        type: "timestamptz",
        default: () => "CURRENT_TIMESTAMP",
    }),
    __metadata("design:type", Date)
], ChatEntity.prototype, "lastActivity", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "created_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], ChatEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => chat_participant_entity_1.ChatParticipantEntity, (participant) => participant.chat),
    __metadata("design:type", Array)
], ChatEntity.prototype, "participants", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.MessageEntity, (message) => message.chat),
    __metadata("design:type", Array)
], ChatEntity.prototype, "messages", void 0);
exports.ChatEntity = ChatEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "chats" })
], ChatEntity);
//# sourceMappingURL=chat.entity.js.map