"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const chat_entity_1 = require("../../entities/chat.entity");
const chat_read_state_entity_1 = require("../../entities/chat-read-state.entity");
const message_entity_1 = require("../../entities/message.entity");
const user_entity_1 = require("../../entities/user.entity");
const chat_controller_1 = require("./chat.controller");
const chat_events_service_1 = require("./chat-events.service");
const chat_gateway_1 = require("./chat.gateway");
const chat_service_1 = require("./chat.service");
function resolveJwtSecret() {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }
    if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET is required in production");
    }
    return "development-only-secret";
}
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([chat_entity_1.Chat, message_entity_1.Message, user_entity_1.User, chat_read_state_entity_1.ChatReadState]),
            jwt_1.JwtModule.register({
                secret: resolveJwtSecret(),
            }),
        ],
        controllers: [chat_controller_1.ChatController],
        providers: [chat_service_1.ChatService, chat_gateway_1.ChatGateway, chat_events_service_1.ChatEventsService],
        exports: [chat_service_1.ChatService, chat_events_service_1.ChatEventsService],
    })
], ChatModule);
//# sourceMappingURL=chat.module.js.map