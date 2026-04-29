import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { ChatService } from "./chat.service";
import { SendRealtimeMessageDto } from "./dto/send-realtime-message.dto";
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly chatService;
    private readonly jwtService;
    private readonly logger;
    constructor(chatService: ChatService, jwtService: JwtService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinChat(chatId: string, client: Socket): void;
    handleLeaveChat(chatId: string, client: Socket): void;
    handleSendMessage(data: SendRealtimeMessageDto, client: Socket): Promise<void>;
    private authenticateClient;
}
