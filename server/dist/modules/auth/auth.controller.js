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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const contact_utils_1 = require("../common/contact.utils");
const current_user_decorator_1 = require("./decorators/current-user.decorator");
const auth_guard_1 = require("./auth.guard");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
const auth_service_1 = require("./auth.service");
const login_auth_dto_1 = require("./dto/login-auth.dto");
const request_auth_dto_1 = require("./dto/request-auth.dto");
const verify_auth_dto_1 = require("./dto/verify-auth.dto");
let AuthController = class AuthController {
    constructor(authService, authRateLimitService) {
        this.authService = authService;
        this.authRateLimitService = authRateLimitService;
    }
    requestCode(request, dto) {
        this.authRateLimitService.consume(`${this.getRequestIP(request)}:request`, {
            message: "Too many auth requests",
        });
        return this.authService.requestCode(dto, {
            requestIP: this.getRequestIP(request),
            userAgent: this.getUserAgent(request),
        });
    }
    verifyCode(request, dto) {
        const phoneOrContact = dto.phone ?? dto.contact;
        if (phoneOrContact) {
            try {
                const normalizedPhone = (0, contact_utils_1.normalizePhone)(phoneOrContact);
                this.authRateLimitService.consume(`${this.getRequestIP(request)}:verify:${normalizedPhone}`, {
                    maxRequests: 10,
                    message: "Too many auth attempts",
                });
            }
            catch {
                this.authRateLimitService.consume(`${this.getRequestIP(request)}:verify`);
            }
        }
        return this.authService.verifyCode(dto);
    }
    login(request, dto) {
        this.authRateLimitService.consume(`${this.getRequestIP(request)}:login`);
        return this.authService.login(dto);
    }
    getMe(user) {
        return this.authService.getMe(user.sub);
    }
    listContacts(user) {
        return this.authService.listContacts(user.sub);
    }
    getRequestIP(request) {
        const forwardedFor = request.headers["x-forwarded-for"];
        if (typeof forwardedFor === "string") {
            return forwardedFor.split(",")[0].trim();
        }
        return request.ip || "unknown";
    }
    getUserAgent(request) {
        const userAgent = request.headers["user-agent"];
        return typeof userAgent === "string" ? userAgent : null;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)("request"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, request_auth_dto_1.RequestAuthDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestCode", null);
__decorate([
    (0, common_1.Post)("verify"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, verify_auth_dto_1.VerifyAuthDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyCode", null);
__decorate([
    (0, common_1.Post)("login"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, login_auth_dto_1.LoginAuthDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)("me"),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getMe", null);
__decorate([
    (0, common_1.Get)("contacts"),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "listContacts", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)("auth"),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_rate_limit_service_1.AuthRateLimitService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map