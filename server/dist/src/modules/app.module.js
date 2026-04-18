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
const chat_entity_1 = require("../entities/chat.entity");
const chat_read_state_entity_1 = require("../entities/chat-read-state.entity");
const message_entity_1 = require("../entities/message.entity");
const user_entity_1 = require("../entities/user.entity");
const app_controller_1 = require("./app.controller");
const auth_module_1 = require("./auth/auth.module");
const chat_module_1 = require("./chat/chat.module");
const health_module_1 = require("./health/health.module");
const version_module_1 = require("./version/version.module");
const isProduction = process.env.NODE_ENV === "production";
const usePostgres = Boolean(process.env.DATABASE_URL);
const databaseConfig = usePostgres
    ? {
        type: "postgres",
        url: process.env.DATABASE_URL,
    }
    : {
        type: "sqlite",
        database: process.env.SQLITE_PATH ?? "database.sqlite",
    };
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot({
                ...databaseConfig,
                entities: [user_entity_1.User, chat_entity_1.Chat, message_entity_1.Message, chat_read_state_entity_1.ChatReadState],
                synchronize: process.env.TYPEORM_SYNC === "true" || !isProduction,
            }),
            health_module_1.HealthModule,
            version_module_1.VersionModule,
            auth_module_1.AuthModule,
            chat_module_1.ChatModule,
        ],
        controllers: [app_controller_1.AppController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map