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
exports.UserEntity = exports.AuthMethod = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const chat_participant_entity_1 = require("./chat-participant.entity");
const media_entity_1 = require("./media.entity");
const message_entity_1 = require("./message.entity");
var AuthMethod;
(function (AuthMethod) {
    AuthMethod["PHONE"] = "phone";
    AuthMethod["EMAIL"] = "email";
})(AuthMethod || (exports.AuthMethod = AuthMethod = {}));
let UserEntity = class UserEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.UserEntity = UserEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], UserEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "simple-enum", enum: AuthMethod }),
    __metadata("design:type", String)
], UserEntity.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", unique: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "contact", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", unique: true, nullable: true }),
    __metadata("design:type", Object)
], UserEntity.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "telegram_chat_id", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], UserEntity.prototype, "telegramChatId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "telegram_username", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], UserEntity.prototype, "telegramUsername", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "display_name", type: "varchar" }),
    __metadata("design:type", String)
], UserEntity.prototype, "displayName", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "created_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], UserEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: "updated_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], UserEntity.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => chat_participant_entity_1.ChatParticipantEntity, (participant) => participant.user),
    __metadata("design:type", Array)
], UserEntity.prototype, "chatParticipants", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.MessageEntity, (message) => message.author),
    __metadata("design:type", Array)
], UserEntity.prototype, "messages", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => media_entity_1.MediaEntity, (media) => media.uploadedBy),
    __metadata("design:type", Array)
], UserEntity.prototype, "uploadedMedia", void 0);
exports.UserEntity = UserEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "users" })
], UserEntity);
//# sourceMappingURL=user.entity.js.map