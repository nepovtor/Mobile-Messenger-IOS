"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRateLimitService = void 0;
const common_1 = require("@nestjs/common");
const runtime_config_1 = require("../common/runtime-config");
let AuthRateLimitService = class AuthRateLimitService {
    constructor() {
        this.attempts = new Map();
        this.windowMs = (0, runtime_config_1.getAuthRateLimitWindowMs)();
        this.maxRequests = (0, runtime_config_1.getAuthRateLimitMaxRequests)();
    }
    consume(key, options) {
        const now = Date.now();
        const windowMs = options?.windowMs ?? this.windowMs;
        const maxRequests = options?.maxRequests ?? this.maxRequests;
        const message = options?.message ?? "Too many auth attempts";
        const windowStart = now - windowMs;
        const current = (this.attempts.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);
        if (current.length >= maxRequests) {
            throw new common_1.HttpException(message, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        current.push(now);
        this.attempts.set(key, current);
    }
};
exports.AuthRateLimitService = AuthRateLimitService;
exports.AuthRateLimitService = AuthRateLimitService = __decorate([
    (0, common_1.Injectable)()
], AuthRateLimitService);
//# sourceMappingURL=auth-rate-limit.service.js.map