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
exports.SendRealtimeMessageDto = void 0;
const class_validator_1 = require("class-validator");
const message_entity_1 = require("../../../entities/message.entity");
class SendRealtimeMessageDto {
}
exports.SendRealtimeMessageDto = SendRealtimeMessageDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SendRealtimeMessageDto.prototype, "chatId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SendRealtimeMessageDto.prototype, "messageID", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(message_entity_1.MessageKind),
    __metadata("design:type", String)
], SendRealtimeMessageDto.prototype, "kind", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(4000),
    __metadata("design:type", String)
], SendRealtimeMessageDto.prototype, "text", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SendRealtimeMessageDto.prototype, "mediaID", void 0);
//# sourceMappingURL=send-realtime-message.dto.js.map