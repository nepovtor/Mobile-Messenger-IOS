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
exports.TelegramLinkEntity = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
let TelegramLinkEntity = class TelegramLinkEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.TelegramLinkEntity = TelegramLinkEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], TelegramLinkEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", unique: true }),
    __metadata("design:type", String)
], TelegramLinkEntity.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "chat_id", type: "varchar" }),
    __metadata("design:type", String)
], TelegramLinkEntity.prototype, "chatId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "telegram_user_id", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], TelegramLinkEntity.prototype, "telegramUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], TelegramLinkEntity.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "first_name", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], TelegramLinkEntity.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "linked_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], TelegramLinkEntity.prototype, "linkedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "last_verified_at", type: "timestamptz", nullable: true }),
    __metadata("design:type", Object)
], TelegramLinkEntity.prototype, "lastVerifiedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "revoked_at", type: "timestamptz", nullable: true }),
    __metadata("design:type", Object)
], TelegramLinkEntity.prototype, "revokedAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: "updated_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], TelegramLinkEntity.prototype, "updatedAt", void 0);
exports.TelegramLinkEntity = TelegramLinkEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "telegram_links" })
], TelegramLinkEntity);
//# sourceMappingURL=telegram-link.entity.js.map