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
exports.PhoneVerificationCodeEntity = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
let PhoneVerificationCodeEntity = class PhoneVerificationCodeEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.PhoneVerificationCodeEntity = PhoneVerificationCodeEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], PhoneVerificationCodeEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar" }),
    __metadata("design:type", String)
], PhoneVerificationCodeEntity.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "code_hash", type: "varchar" }),
    __metadata("design:type", String)
], PhoneVerificationCodeEntity.prototype, "codeHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "expires_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], PhoneVerificationCodeEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "int", default: 0 }),
    __metadata("design:type", Number)
], PhoneVerificationCodeEntity.prototype, "attempts", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "consumed_at", type: "timestamptz", nullable: true }),
    __metadata("design:type", Object)
], PhoneVerificationCodeEntity.prototype, "consumedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "created_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], PhoneVerificationCodeEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "resend_available_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], PhoneVerificationCodeEntity.prototype, "resendAvailableAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "request_ip", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], PhoneVerificationCodeEntity.prototype, "requestIP", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "user_agent", type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], PhoneVerificationCodeEntity.prototype, "userAgent", void 0);
exports.PhoneVerificationCodeEntity = PhoneVerificationCodeEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "phone_verification_codes" }),
    (0, typeorm_1.Index)(["phone", "createdAt"])
], PhoneVerificationCodeEntity);
//# sourceMappingURL=phone-verification-code.entity.js.map