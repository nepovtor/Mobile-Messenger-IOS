"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const phone_verification_code_entity_1 = require("../../entities/phone-verification-code.entity");
const telegram_link_entity_1 = require("../../entities/telegram-link.entity");
const user_entity_1 = require("../../entities/user.entity");
const runtime_config_1 = require("../common/runtime-config");
const auth_controller_1 = require("./auth.controller");
const auth_guard_1 = require("./auth.guard");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
const auth_service_1 = require("./auth.service");
const console_sms_provider_1 = require("./sms/console-sms.provider");
const mock_sms_provider_1 = require("./sms/mock-sms.provider");
const sms_types_1 = require("./sms/sms.types");
const twilio_sms_provider_1 = require("./sms/twilio-sms.provider");
const unavailable_sms_provider_1 = require("./sms/unavailable-sms.provider");
const telegram_bot_service_1 = require("./telegram/telegram-bot.service");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.UserEntity,
                phone_verification_code_entity_1.PhoneVerificationCodeEntity,
                telegram_link_entity_1.TelegramLinkEntity,
            ]),
            jwt_1.JwtModule.registerAsync({
                useFactory: async () => ({
                    secret: (0, runtime_config_1.getJwtSecret)(),
                }),
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            auth_guard_1.AuthGuard,
            auth_rate_limit_service_1.AuthRateLimitService,
            telegram_bot_service_1.TelegramBotService,
            {
                provide: sms_types_1.SMS_SERVICE,
                inject: [telegram_bot_service_1.TelegramBotService],
                useFactory: (telegramBotService) => {
                    const logger = new common_1.Logger("SmsProvider");
                    const provider = (0, runtime_config_1.getVerificationProvider)();
                    if (provider === "telegram") {
                        return telegramBotService;
                    }
                    if (provider === "mock") {
                        return new mock_sms_provider_1.MockSmsProvider();
                    }
                    if (provider === "console") {
                        return new console_sms_provider_1.ConsoleSmsProvider(logger);
                    }
                    if (provider === "sms") {
                        const smsProvider = (0, runtime_config_1.getSmsProvider)();
                        if (smsProvider === "mock") {
                            return new mock_sms_provider_1.MockSmsProvider();
                        }
                        if (smsProvider === "console") {
                            return new console_sms_provider_1.ConsoleSmsProvider(logger);
                        }
                        const config = (0, runtime_config_1.getTwilioConfig)();
                        if (!config) {
                            return new unavailable_sms_provider_1.UnavailableSmsProvider(logger, "Twilio credentials are not configured");
                        }
                        return new twilio_sms_provider_1.TwilioSmsProvider(config, logger);
                    }
                    return new unavailable_sms_provider_1.UnavailableSmsProvider(logger, `Verification provider "${provider}" is not implemented in this build`);
                },
            },
        ],
        exports: [
            auth_service_1.AuthService,
            auth_guard_1.AuthGuard,
            auth_rate_limit_service_1.AuthRateLimitService,
            jwt_1.JwtModule,
            typeorm_1.TypeOrmModule,
            sms_types_1.SMS_SERVICE,
        ],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map