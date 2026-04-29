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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const jwt_auth_guard_1 = require("../../jwt-auth.guard");
const chat_events_service_1 = require("./chat-events.service");
let RealtimeController = class RealtimeController {
    constructor(chatEventsService) {
        this.chatEventsService = chatEventsService;
    }
    streamAllEvents(request) {
        return this.chatEventsService.subscribeAll(request.user.sub);
    }
};
exports.RealtimeController = RealtimeController;
__decorate([
    (0, common_1.Sse)("events"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], RealtimeController.prototype, "streamAllEvents", null);
exports.RealtimeController = RealtimeController = __decorate([
    (0, common_1.Controller)("realtime"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof chat_events_service_1.ChatEventsService !== "undefined" && chat_events_service_1.ChatEventsService) === "function" ? _a : Object])
], RealtimeController);
//# sourceMappingURL=realtime.controller.js.map