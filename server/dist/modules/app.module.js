"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const phone_verification_code_entity_1 = require("../entities/phone-verification-code.entity");
const telegram_link_entity_1 = require("../entities/telegram-link.entity");
const runtime_config_1 = require("./common/runtime-config");
const auth_module_1 = require("./auth/auth.module");
const chat_module_1 = require("./chat/chat.module");
const docs_module_1 = require("./docs/docs.module");
const health_module_1 = require("./health/health.module");
const media_module_1 = require("./media/media.module");
const realtime_module_1 = require("./realtime/realtime.module");
const version_module_1 = require("./version/version.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot({
                type: "postgres",
                host: process.env.DB_HOST || "localhost",
                port: Number(process.env.DB_PORT || "5432"),
                username: process.env.DB_USER || "postgres",
                password: process.env.DB_PASSWORD || "postgres",
                database: process.env.DB_NAME || "messenger",
                autoLoadEntities: true,
                synchronize: (0, runtime_config_1.isDatabaseSynchronizationEnabled)(),
                retryAttempts: 5,
                retryDelay: 2000,
                entities: [phone_verification_code_entity_1.PhoneVerificationCodeEntity, telegram_link_entity_1.TelegramLinkEntity],
            }),
            docs_module_1.DocsModule,
            health_module_1.HealthModule,
            version_module_1.VersionModule,
            auth_module_1.AuthModule,
            realtime_module_1.RealtimeModule,
            media_module_1.MediaModule,
            chat_module_1.ChatModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map