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
exports.MediaController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const confirm_upload_dto_1 = require("./dto/confirm-upload.dto");
const request_upload_url_dto_1 = require("./dto/request-upload-url.dto");
const media_service_1 = require("./media.service");
let MediaController = class MediaController {
    constructor(mediaService) {
        this.mediaService = mediaService;
    }
    createUploadUrl(user, dto) {
        return this.mediaService.createUploadUrl(user.sub, dto);
    }
    async confirmUpload(mediaID, user, dto) {
        const media = await this.mediaService.confirmUpload(mediaID, user.sub);
        return {
            id: media.id,
            status: media.status,
            etag: dto.etag ?? null,
        };
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, common_1.Post)("upload-url"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, request_upload_url_dto_1.RequestUploadUrlDto]),
    __metadata("design:returntype", void 0)
], MediaController.prototype, "createUploadUrl", null);
__decorate([
    (0, common_1.Post)(":mediaID/confirm"),
    __param(0, (0, common_1.Param)("mediaID", new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, confirm_upload_dto_1.ConfirmUploadDto]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "confirmUpload", null);
exports.MediaController = MediaController = __decorate([
    (0, common_1.Controller)("media"),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [media_service_1.MediaService])
], MediaController);
//# sourceMappingURL=media.controller.js.map