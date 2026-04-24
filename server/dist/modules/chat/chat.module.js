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
const typeorm_1 = require("@nestjs/typeorm");
const chat_entity_1 = require("../../entities/chat.entity");
const chat_participant_entity_1 = require("../../entities/chat-participant.entity");
const media_entity_1 = require("../../entities/media.entity");
const message_entity_1 = require("../../entities/message.entity");
const user_entity_1 = require("../../entities/user.entity");
const auth_module_1 = require("../auth/auth.module");
const media_module_1 = require("../media/media.module");
const realtime_module_1 = require("../realtime/realtime.module");
const chat_controller_1 = require("./chat.controller");
const chat_service_1 = require("./chat.service");
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                chat_entity_1.ChatEntity,
                chat_participant_entity_1.ChatParticipantEntity,
                message_entity_1.MessageEntity,
                user_entity_1.UserEntity,
                media_entity_1.MediaEntity,
            ]),
            auth_module_1.AuthModule,
            (0, common_1.forwardRef)(() => realtime_module_1.RealtimeModule),
            media_module_1.MediaModule,
        ],
        controllers: [chat_controller_1.ChatController],
        providers: [chat_service_1.ChatService],
        exports: [chat_service_1.ChatService],
    })
], ChatModule);
//# sourceMappingURL=chat.module.js.map