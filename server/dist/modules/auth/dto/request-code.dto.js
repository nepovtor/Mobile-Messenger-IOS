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
exports.RequestCodeDto = exports.AuthMethodDto = void 0;
const class_validator_1 = require("class-validator");
var AuthMethodDto;
(function (AuthMethodDto) {
    AuthMethodDto["Phone"] = "phone";
})(AuthMethodDto || (exports.AuthMethodDto = AuthMethodDto = {}));
class RequestCodeDto {
}
exports.RequestCodeDto = RequestCodeDto;
__decorate([
    (0, class_validator_1.IsEnum)(AuthMethodDto),
    __metadata("design:type", String)
], RequestCodeDto.prototype, "method", void 0);
__decorate([
    (0, class_validator_1.Matches)(/^\+?[1-9]\d{9,14}$/, {
        message: "contact must be a valid phone number in E.164 format",
    }),
    __metadata("design:type", String)
], RequestCodeDto.prototype, "contact", void 0);
//# sourceMappingURL=request-code.dto.js.map