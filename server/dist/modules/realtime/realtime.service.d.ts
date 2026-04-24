import { MessageEvent, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Observable } from "rxjs";
import { WebSocket } from "ws";
export interface RealtimeEventEnvelope<T = unknown> {
    event: string;
    data: T;
}
interface RealtimePayload {
    type: string;
    payload: unknown;
}
export declare class RealtimeService implements OnModuleInit, OnModuleDestroy {
    private readonly userStreams;
    private readonly userConnections;
    private readonly connectionMeta;
    private readonly typingState;
    private readonly heartbeatIntervalMs;
    private readonly heartbeatTimeoutMs;
    private heartbeatTimer;
    onModuleInit(): void;
    onModuleDestroy(): void;
    subscribe(userID: string): Observable<MessageEvent>;
    registerConnection(userID: string, socket: WebSocket): void;
    unregisterConnection(userID: string, socket: WebSocket): void;
    sendToUser<T>(userID: string, event: RealtimeEventEnvelope<T>): void;
    broadcastToUsers<T>(userIDs: string[], event: RealtimeEventEnvelope<T>): void;
    setTyping(chatID: string, userID: string, displayName: string, isTyping: boolean): string[];
    getTypingParticipants(chatID: string, excludeUserID?: string): string[];
    publishToUsers(userIDs: string[], message: RealtimePayload): void;
    broadcastToChatParticipants<T>(participants: Array<{
        userId: string;
    }>, event: RealtimeEventEnvelope<T>): void;
    private sendEnvelope;
    private flushHeartbeat;
    private getStream;
}
export {};
