"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeModule = void 0;
const common_1 = require("@nestjs/common");
const chat_module_1 = require("../chat/chat.module");
const auth_module_1 = require("../auth/auth.module");
const realtime_controller_1 = require("./realtime.controller");
const realtime_gateway_1 = require("./realtime.gateway");
const realtime_service_1 = require("./realtime.service");
let RealtimeModule = class RealtimeModule {
};
exports.RealtimeModule = RealtimeModule;
exports.RealtimeModule = RealtimeModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, (0, common_1.forwardRef)(() => chat_module_1.ChatModule)],
        controllers: [realtime_controller_1.RealtimeController],
        providers: [realtime_service_1.RealtimeService, realtime_gateway_1.RealtimeGateway],
        exports: [realtime_service_1.RealtimeService],
    })
], RealtimeModule);
//# sourceMappingURL=realtime.module.js.map