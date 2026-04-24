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
const ws_1 = require("ws");
const runtime_config_1 = require("../common/runtime-config");
let RealtimeService = class RealtimeService {
    constructor() {
        this.userStreams = new Map();
        this.userConnections = new Map();
        this.connectionMeta = new Map();
        this.typingState = new Map();
        this.heartbeatIntervalMs = (0, runtime_config_1.getRealtimeHeartbeatIntervalMs)();
        this.heartbeatTimeoutMs = (0, runtime_config_1.getRealtimeHeartbeatTimeoutMs)();
        this.heartbeatTimer = null;
    }
    onModuleInit() {
        this.heartbeatTimer = setInterval(() => {
            this.flushHeartbeat();
        }, this.heartbeatIntervalMs);
    }
    onModuleDestroy() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    subscribe(userID) {
        const stream = this.getStream(userID);
        return (0, rxjs_1.merge)(stream.asObservable(), (0, rxjs_1.interval)(15000).pipe((0, rxjs_1.map)(() => ({
            type: "keepalive",
            data: { timestamp: new Date().toISOString() },
        }))));
    }
    registerConnection(userID, socket) {
        const sockets = this.userConnections.get(userID) ?? new Set();
        sockets.add(socket);
        this.userConnections.set(userID, sockets);
        const pongListener = () => {
            const meta = this.connectionMeta.get(socket);
            if (meta) {
                meta.lastPongAt = Date.now();
                this.connectionMeta.set(socket, meta);
            }
        };
        const closeListener = () => {
            this.unregisterConnection(userID, socket);
        };
        socket.on("pong", pongListener);
        socket.on("close", closeListener);
        this.connectionMeta.set(socket, {
            userID,
            lastPongAt: Date.now(),
            pongListener,
            closeListener,
        });
    }
    unregisterConnection(userID, socket) {
        const sockets = this.userConnections.get(userID);
        if (!sockets) {
            return;
        }
        sockets.delete(socket);
        if (sockets.size === 0) {
            this.userConnections.delete(userID);
        }
        const meta = this.connectionMeta.get(socket);
        if (meta) {
            socket.off("pong", meta.pongListener);
            socket.off("close", meta.closeListener);
            this.connectionMeta.delete(socket);
        }
    }
    sendToUser(userID, event) {
        this.sendEnvelope(userID, event);
        this.getStream(userID).next({
            type: event.event,
            data: event.data === null
                ? {}
                : typeof event.data === "string" || typeof event.data === "object"
                    ? event.data
                    : { value: event.data },
        });
    }
    broadcastToUsers(userIDs, event) {
        const uniqueUserIDs = new Set(userIDs);
        for (const userID of uniqueUserIDs) {
            this.sendToUser(userID, event);
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
    publishToUsers(userIDs, message) {
        this.broadcastToUsers(userIDs, {
            event: message.type,
            data: message.payload,
        });
    }
    broadcastToChatParticipants(participants, event) {
        this.broadcastToUsers(participants.map((participant) => participant.userId), event);
    }
    sendEnvelope(userID, event) {
        const sockets = this.userConnections.get(userID);
        if (!sockets?.size) {
            return;
        }
        const payload = JSON.stringify(event);
        for (const socket of sockets) {
            if (socket.readyState === ws_1.WebSocket.OPEN) {
                socket.send(payload);
            }
        }
    }
    flushHeartbeat() {
        const now = Date.now();
        for (const [socket, meta] of this.connectionMeta.entries()) {
            if (socket.readyState !== ws_1.WebSocket.OPEN) {
                this.unregisterConnection(meta.userID, socket);
                continue;
            }
            if (now - meta.lastPongAt > this.heartbeatTimeoutMs) {
                socket.terminate();
                this.unregisterConnection(meta.userID, socket);
                continue;
            }
            socket.ping();
        }
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