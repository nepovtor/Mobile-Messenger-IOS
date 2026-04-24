import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import { MessageKind } from "../../entities/message.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import { getJwtSecret } from "../common/runtime-config";
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

@WebSocketGateway({
  path: "/realtime",
  cors: false,
})
export class RealtimeGateway
  implements OnGatewayConnection<RealtimeSocket>, OnGatewayDisconnect<RealtimeSocket>
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly realtimeService: RealtimeService,
    private readonly chatService: ChatService,
  ) {}

  handleConnection(client: RealtimeSocket, request: IncomingMessage): void {
    const user = this.authenticate(request);
    if (!user) {
      client.close(4001, "Unauthorized");
      return;
    }

    client.user = user;
    this.realtimeService.registerConnection(user.sub, client);
    this.realtimeService.sendToUser(user.sub, {
      event: "connection.ready",
      data: {
        userID: user.sub,
      },
    });
    this.logger.log(`Realtime connected user=${user.sub}`);
  }

  handleDisconnect(client: RealtimeSocket): void {
    const userID = client.user?.sub;
    if (!userID) {
      return;
    }

    this.realtimeService.unregisterConnection(userID, client);
    this.logger.log(`Realtime disconnected user=${userID}`);
  }

  @SubscribeMessage("message.send")
  async handleMessageSend(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: MessageSendPayload,
  ) {
    const user = this.requireUser(client);

    try {
      const message = await this.chatService.addRealtimeMessage(body.chatID, body, user);
      return {
        event: "message.send.ack",
        data: {
          chatID: body.chatID,
          clientMessageId: body.clientMessageId,
          message,
        },
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Failed to send message";

      this.realtimeService.sendToUser(user.sub, {
        event: "message.failed",
        data: {
          chatID: body.chatID,
          clientMessageId: body.clientMessageId,
          reason,
        },
      });
      return {
        event: "message.failed",
        data: {
          chatID: body.chatID,
          clientMessageId: body.clientMessageId,
          reason,
        },
      };
    }
  }

  @SubscribeMessage("typing.started")
  async handleTypingStarted(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: Omit<TypingPayload, "isTyping">,
  ) {
    const user = this.requireUser(client);
    return {
      event: "typing.started",
      data: await this.chatService.setRealtimeTyping(
        body.chatID,
        { isTyping: true },
        user,
      ),
    };
  }

  @SubscribeMessage("typing.stopped")
  async handleTypingStopped(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: Omit<TypingPayload, "isTyping">,
  ) {
    const user = this.requireUser(client);
    return {
      event: "typing.stopped",
      data: await this.chatService.setRealtimeTyping(
        body.chatID,
        { isTyping: false },
        user,
      ),
    };
  }

  @SubscribeMessage("message.read")
  async handleMessageRead(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: ReadPayload,
  ) {
    const user = this.requireUser(client);
    await this.chatService.markRead(body.chatID, body.messageID, user);
    return {
      event: "message.read.ack",
      data: {
        chatID: body.chatID,
        messageID: body.messageID,
      },
    };
  }

  private requireUser(client: RealtimeSocket): AuthenticatedUser {
    if (!client.user) {
      throw new Error("Unauthorized");
    }
    return client.user;
  }

  private authenticate(request: IncomingMessage): AuthenticatedUser | null {
    const authorizationHeader = request.headers.authorization;
    const header = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;

    if (!header?.startsWith("Bearer ")) {
      return null;
    }

    try {
      return this.jwtService.verify<AuthenticatedUser>(header.slice(7), {
        secret: getJwtSecret(),
      });
    } catch {
      return null;
    }
  }
}
