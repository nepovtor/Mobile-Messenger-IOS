"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatEventsService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
let ChatEventsService = class ChatEventsService {
    constructor() {
        this.subscribers = new Map();
        this.globalSubscribers = new Map();
    }
    subscribe(chatID, userID, initialChat) {
        const subscriptionID = `${userID}_${Date.now()}_${Math.random()
            .toString(16)
            .slice(2)}`;
        const subject = new rxjs_1.Subject();
        const chatSubscribers = this.subscribers.get(chatID) ?? new Map();
        chatSubscribers.set(subscriptionID, {
            userID,
            subject,
        });
        this.subscribers.set(chatID, chatSubscribers);
        subject.next(this.makeMessageEvent("connected", initialChat));
        return subject.asObservable().pipe((0, operators_1.finalize)(() => {
            const currentSubscribers = this.subscribers.get(chatID);
            currentSubscribers?.delete(subscriptionID);
            if (currentSubscribers && currentSubscribers.size === 0) {
                this.subscribers.delete(chatID);
            }
        }));
    }
    subscribeAll(userID) {
        const subscriptionID = `${userID}_global_${Date.now()}_${Math.random()
            .toString(16)
            .slice(2)}`;
        const subject = new rxjs_1.Subject();
        this.globalSubscribers.set(subscriptionID, {
            userID,
            subject,
        });
        subject.next({
            type: "keepalive",
            data: { ok: true },
        });
        return subject.asObservable().pipe((0, operators_1.finalize)(() => {
            this.globalSubscribers.delete(subscriptionID);
        }));
    }
    publishMessage(chatID, message) {
        const subscribers = this.subscribers.get(chatID);
        const event = this.makeMessageEvent("message", message);
        if (subscribers) {
            for (const subscriber of subscribers.values()) {
                subscriber.subject.next(event);
            }
        }
        for (const subscriber of this.globalSubscribers.values()) {
            subscriber.subject.next({
                type: "message.created",
                data: {
                    chatID,
                    message,
                },
            });
        }
    }
    async publishChatUpdated(chatID, resolveChatForUser) {
        const subscribers = this.subscribers.get(chatID);
        if (!subscribers) {
            return;
        }
        await Promise.all(Array.from(subscribers.values()).map(async (subscriber) => {
            const chat = await resolveChatForUser(subscriber.userID);
            subscriber.subject.next(this.makeMessageEvent("chatUpdated", chat));
        }));
    }
    publishMessageRead(chatID, messageID) {
        for (const subscriber of this.globalSubscribers.values()) {
            subscriber.subject.next({
                type: "message.read",
                data: {
                    chatID,
                    messageID,
                },
            });
        }
    }
    publishTypingChanged(chatID, typingParticipants) {
        for (const subscriber of this.globalSubscribers.values()) {
            subscriber.subject.next({
                type: "typing.changed",
                data: {
                    chatID,
                    typingParticipants,
                },
            });
        }
    }
    makeMessageEvent(type, data) {
        return {
            type,
            data,
        };
    }
};
exports.ChatEventsService = ChatEventsService;
exports.ChatEventsService = ChatEventsService = __decorate([
    (0, common_1.Injectable)()
], ChatEventsService);
//# sourceMappingURL=chat-events.service.js.map