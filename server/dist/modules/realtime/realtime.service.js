"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
let RealtimeService = class RealtimeService {
    constructor() {
        this.userStreams = new Map();
        this.typingState = new Map();
    }
    subscribe(userID) {
        const stream = this.getStream(userID);
        return (0, rxjs_1.merge)(stream.asObservable(), (0, rxjs_1.interval)(15000).pipe((0, rxjs_1.map)(() => ({
            type: "keepalive",
            data: { timestamp: new Date().toISOString() },
        }))));
    }
    publishToUsers(userIDs, message) {
        const uniqueUserIDs = new Set(userIDs);
        for (const userID of uniqueUserIDs) {
            this.getStream(userID).next({
                type: message.type,
                data: message.payload,
            });
        }
    }
    setTyping(chatID, userID, displayName, isTyping) {
        const chatTyping = this.typingState.get(chatID) ??
            new Map();
        if (isTyping) {
            chatTyping.set(userID, { userID, displayName });
        }
        else {
            chatTyping.delete(userID);
        }
        if (chatTyping.size === 0) {
            this.typingState.delete(chatID);
            return [];
        }
        this.typingState.set(chatID, chatTyping);
        return Array.from(chatTyping.values()).map((item) => item.displayName);
    }
    getTypingParticipants(chatID, excludeUserID) {
        const chatTyping = this.typingState.get(chatID);
        if (!chatTyping) {
            return [];
        }
        return Array.from(chatTyping.values())
            .filter((item) => item.userID !== excludeUserID)
            .map((item) => item.displayName);
    }
    getStream(userID) {
        let stream = this.userStreams.get(userID);
        if (!stream) {
            stream = new rxjs_1.Subject();
            this.userStreams.set(userID, stream);
        }
        return stream;
    }
};
exports.RealtimeService = RealtimeService;
exports.RealtimeService = RealtimeService = __decorate([
    (0, common_1.Injectable)()
], RealtimeService);
//# sourceMappingURL=realtime.service.js.map