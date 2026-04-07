import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { JwtPayload } from "../../auth.types";
import { ChatService } from "./chat.service";
import { SendRealtimeMessageDto } from "./dto/send-realtime-message.dto";

@WebSocketGateway({
  cors: {
    origin: "*",
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    const user = this.authenticateClient(client);
    if (!user) {
      client.emit("error", { message: "Unauthorized" });
      client.disconnect();
      return;
    }

    client.data.user = user;
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("joinChat")
  handleJoinChat(
    @MessageBody() chatId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(chatId);
    this.logger.log(`Client ${client.id} joined chat ${chatId}`);
  }

  @SubscribeMessage("leaveChat")
  handleLeaveChat(
    @MessageBody() chatId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(chatId);
    this.logger.log(`Client ${client.id} left chat ${chatId}`);
  }

  @SubscribeMessage("sendMessage")
  async handleSendMessage(
    @MessageBody() data: SendRealtimeMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user) {
      client.emit("error", { message: "Unauthorized" });
      client.disconnect();
      return;
    }

    try {
      const message = await this.chatService.addMessage(
        data.chatId,
        data,
        user.sub,
      );
      client.to(data.chatId).emit("newMessage", message);
      client.emit("messageSent", message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      client.emit("error", { message });
    }
  }

  private authenticateClient(client: Socket): JwtPayload | null {
    const authToken = client.handshake.auth.token;
    const authorizationHeader = client.handshake.headers.authorization;
    const bearerToken =
      typeof authToken === "string"
        ? authToken
        : typeof authorizationHeader === "string" &&
            authorizationHeader.startsWith("Bearer ")
          ? authorizationHeader.substring(7)
          : null;

    if (!bearerToken) {
      return null;
    }

    try {
      return this.jwtService.verify<JwtPayload>(bearerToken);
    } catch {
      return null;
    }
  }
}
