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
exports.MediaEntity = exports.MediaStatus = void 0;
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const message_entity_1 = require("./message.entity");
const user_entity_1 = require("./user.entity");
var MediaStatus;
(function (MediaStatus) {
    MediaStatus["PENDING"] = "pending";
    MediaStatus["UPLOADED"] = "uploaded";
})(MediaStatus || (exports.MediaStatus = MediaStatus = {}));
let MediaEntity = class MediaEntity {
    constructor() {
        this.id = (0, node_crypto_1.randomUUID)();
    }
};
exports.MediaEntity = MediaEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)("uuid"),
    __metadata("design:type", Object)
], MediaEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "object_key", type: "varchar", unique: true }),
    __metadata("design:type", String)
], MediaEntity.prototype, "objectKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "mime_type", type: "varchar" }),
    __metadata("design:type", String)
], MediaEntity.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "size_bytes", type: "integer" }),
    __metadata("design:type", Number)
], MediaEntity.prototype, "sizeBytes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "integer", nullable: true }),
    __metadata("design:type", Object)
], MediaEntity.prototype, "width", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "integer", nullable: true }),
    __metadata("design:type", Object)
], MediaEntity.prototype, "height", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "uploaded_by_id", type: "uuid" }),
    __metadata("design:type", String)
], MediaEntity.prototype, "uploadedById", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, (user) => user.uploadedMedia, {
        onDelete: "CASCADE",
    }),
    (0, typeorm_1.JoinColumn)({ name: "uploaded_by_id" }),
    __metadata("design:type", user_entity_1.UserEntity)
], MediaEntity.prototype, "uploadedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "simple-enum",
        enum: MediaStatus,
        default: MediaStatus.PENDING,
    }),
    __metadata("design:type", String)
], MediaEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "created_at", type: "timestamptz" }),
    __metadata("design:type", Date)
], MediaEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.MessageEntity, (message) => message.media),
    __metadata("design:type", Array)
], MediaEntity.prototype, "messages", void 0);
exports.MediaEntity = MediaEntity = __decorate([
    (0, typeorm_1.Entity)({ name: "media" })
], MediaEntity);
//# sourceMappingURL=media.entity.js.map