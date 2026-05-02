import { JwtService } from "@nestjs/jwt";
import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import { MessageKind } from "../../entities/message.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { ChatService } from "../chat/chat.service";
import { RealtimeService } from "./realtime.service";
type RealtimeSocket = WebSocket & {
    user?: AuthenticatedUser;
};
type MessageSendPayload = {
    chatID: string;
    clientMessageId: string;
    kind: MessageKind;
    text?: string;
    mediaID?: string;
};
type TypingPayload = {
    chatID: string;
    isTyping: boolean;
};
type ReadPayload = {
    chatID: string;
    messageID: string;
};
type UpdateMessagePayload = {
    chatID: string;
    messageID: string;
    text: string;
};
type DeleteMessagePayload = {
    chatID: string;
    messageID: string;
};
export declare class RealtimeGateway implements OnGatewayConnection<RealtimeSocket>, OnGatewayDisconnect<RealtimeSocket> {
    private readonly jwtService;
    private readonly realtimeService;
    private readonly chatService;
    private readonly logger;
    constructor(jwtService: JwtService, realtimeService: RealtimeService, chatService: ChatService);
    handleConnection(client: RealtimeSocket, request: IncomingMessage): void;
    handleDisconnect(client: RealtimeSocket): void;
    handleMessageSend(client: RealtimeSocket, body: MessageSendPayload): Promise<{
        event: string;
        data: {
            chatID: string;
            clientMessageId: string;
            message: import("../chat/chat.service").MessageResponse;
            reason?: undefined;
        };
    } | {
        event: string;
        data: {
            chatID: string;
            clientMessageId: string;
            reason: string;
            message?: undefined;
        };
    }>;
    handleTypingStarted(client: RealtimeSocket, body: Omit<TypingPayload, "isTyping">): Promise<{
        event: string;
        data: {
            chatID: string;
            userID: string;
            isTyping: boolean;
            typingParticipants: string[];
        };
    }>;
    handleTypingStopped(client: RealtimeSocket, body: Omit<TypingPayload, "isTyping">): Promise<{
        event: string;
        data: {
            chatID: string;
            userID: string;
            isTyping: boolean;
            typingParticipants: string[];
        };
    }>;
    handleMessageRead(client: RealtimeSocket, body: ReadPayload): Promise<{
        event: string;
        data: {
            chatID: string;
            messageID: string;
        };
    }>;
    handleMessageUpdate(client: RealtimeSocket, body: UpdateMessagePayload): Promise<{
        event: string;
        data: {
            chatID: string;
            message: import("../chat/chat.service").MessageResponse;
        };
    }>;
    handleMessageDelete(client: RealtimeSocket, body: DeleteMessagePayload): Promise<{
        event: string;
        data: {
            chatID: string;
            message: import("../chat/chat.service").MessageResponse;
        };
    }>;
    private requireUser;
    private authenticate;
    private extractTokenFromQuery;
}
export {};
