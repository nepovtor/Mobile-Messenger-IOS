import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from "@nestjs/websockets";
import { IncomingMessage } from "node:http";
import { Repository } from "typeorm";
import { WebSocket } from "ws";
import { SessionPrincipalType } from "../../entities/auth-session.entity";
import { MessageKind } from "../../entities/message.entity";
import { UserEntity, UserStatus } from "../../entities/user.entity";
import { AuthenticatedUser } from "../common/authenticated-user";
import {
  getRealtimeSessionRevalidationIntervalMs,
  getWebSocketOrigins,
} from "../common/runtime-config";
import { SessionService } from "../sessions/session.service";
import { ChatService } from "../chat/chat.service";
import { RealtimeService } from "./realtime.service";

type RealtimeSocket = WebSocket & {
  user?: AuthenticatedUser;
  authTimer?: NodeJS.Timeout;
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

@WebSocketGateway({
  path: "/realtime",
  cors: false,
  maxPayload: 65_536,
})
export class RealtimeGateway
  implements
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly sessionService: SessionService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly realtimeService: RealtimeService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(
    client: RealtimeSocket,
    request: IncomingMessage,
  ): Promise<void> {
    const user = await this.authenticate(request);
    if (!user) {
      client.close(4001, "Unauthorized");
      return;
    }

    client.user = user;
    if (
      !this.realtimeService.registerConnection(
        user.sub,
        user.deviceUuid,
        client,
        request.socket.remoteAddress ?? "unknown",
      )
    ) {
      client.close(4008, "Connection limit exceeded");
      return;
    }
    this.realtimeService.sendToUser(user.sub, {
      event: "connection.ready",
      data: {
        userID: user.sub,
      },
    });
    client.authTimer = setInterval(() => {
      void this.revalidateConnection(client);
    }, getRealtimeSessionRevalidationIntervalMs());
    client.authTimer.unref();
    this.logger.log(`Realtime connected user=${user.sub}`);
  }

  handleDisconnect(client: RealtimeSocket): void {
    const userID = client.user?.sub;
    if (!userID) {
      return;
    }

    if (client.authTimer) {
      clearInterval(client.authTimer);
      client.authTimer = undefined;
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
    this.requireEventQuota(client, "message.send", user.sub);
    this.assertMessageSendPayload(body);

    try {
      const message = await this.chatService.addRealtimeMessage(
        body.chatID,
        body,
        user,
      );
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
    this.requireEventQuota(client, "typing.started", user.sub);
    this.assertTypingPayload(body);
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
    this.requireEventQuota(client, "typing.stopped", user.sub);
    this.assertTypingPayload(body);
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
    this.requireEventQuota(client, "message.read", user.sub);
    this.assertReadPayload(body);
    await this.chatService.markRead(body.chatID, body.messageID, user);
    return {
      event: "message.read.ack",
      data: {
        chatID: body.chatID,
        messageID: body.messageID,
      },
    };
  }

  @SubscribeMessage("message.update")
  async handleMessageUpdate(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: UpdateMessagePayload,
  ) {
    const user = this.requireUser(client);
    this.requireEventQuota(client, "message.update", user.sub);
    this.assertUpdatePayload(body);
    return {
      event: "message.updated",
      data: {
        chatID: body.chatID,
        message: await this.chatService.updateMessage(
          body.chatID,
          body.messageID,
          { text: body.text },
          user,
        ),
      },
    };
  }

  @SubscribeMessage("message.delete")
  async handleMessageDelete(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: DeleteMessagePayload,
  ) {
    const user = this.requireUser(client);
    this.requireEventQuota(client, "message.delete", user.sub);
    this.assertDeletePayload(body);
    return {
      event: "message.deleted",
      data: {
        chatID: body.chatID,
        message: await this.chatService.deleteMessage(
          body.chatID,
          body.messageID,
          user,
        ),
      },
    };
  }

  private requireUser(client: RealtimeSocket): AuthenticatedUser {
    if (!client.user) {
      throw new Error("Unauthorized");
    }
    return client.user;
  }

  private requireEventQuota(
    client: RealtimeSocket,
    eventType: string,
    userID: string,
  ): void {
    if (this.realtimeService.consumeEventQuota(client, eventType)) {
      return;
    }
    this.logger.warn(`Realtime rate limit user=${userID} event=${eventType}`);
    throw new WsException("Rate limit exceeded");
  }

  private assertMessageSendPayload(
    body: MessageSendPayload,
  ): asserts body is MessageSendPayload {
    const record = this.requirePayloadRecord(body, [
      "chatID",
      "clientMessageId",
      "kind",
      "text",
      "mediaID",
    ]);
    this.requireUuid(record["chatID"]);
    this.requireString(record["clientMessageId"], 1, 128);
    if (
      record["kind"] !== MessageKind.TEXT &&
      record["kind"] !== MessageKind.IMAGE
    ) {
      throw new WsException("Invalid payload");
    }
    if (record["text"] !== undefined) {
      this.requireString(record["text"], 1, 4_000);
    }
    if (record["mediaID"] !== undefined) {
      this.requireUuid(record["mediaID"]);
    }
  }

  private assertTypingPayload(body: Omit<TypingPayload, "isTyping">): void {
    const record = this.requirePayloadRecord(body, ["chatID"]);
    this.requireUuid(record["chatID"]);
  }

  private assertReadPayload(body: ReadPayload): void {
    const record = this.requirePayloadRecord(body, ["chatID", "messageID"]);
    this.requireUuid(record["chatID"]);
    this.requireUuid(record["messageID"]);
  }

  private assertUpdatePayload(body: UpdateMessagePayload): void {
    const record = this.requirePayloadRecord(body, [
      "chatID",
      "messageID",
      "text",
    ]);
    this.requireUuid(record["chatID"]);
    this.requireUuid(record["messageID"]);
    this.requireString(record["text"], 1, 4_000);
  }

  private assertDeletePayload(body: DeleteMessagePayload): void {
    const record = this.requirePayloadRecord(body, ["chatID", "messageID"]);
    this.requireUuid(record["chatID"]);
    this.requireUuid(record["messageID"]);
  }

  private requirePayloadRecord(
    value: unknown,
    allowedKeys: string[],
  ): Record<string, unknown> {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !allowedKeys.includes(key))
    ) {
      throw new WsException("Invalid payload");
    }
    return value as Record<string, unknown>;
  }

  private requireUuid(value: unknown): void {
    if (
      typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new WsException("Invalid payload");
    }
  }

  private requireString(value: unknown, min: number, max: number): void {
    if (typeof value !== "string" || value.length < min || value.length > max) {
      throw new WsException("Invalid payload");
    }
  }

  private async authenticate(
    request: IncomingMessage,
  ): Promise<AuthenticatedUser | null> {
    const origin = request.headers.origin;
    if (
      origin &&
      (Array.isArray(origin) || !getWebSocketOrigins().includes(origin))
    ) {
      return null;
    }
    const authorizationHeader = request.headers.authorization;
    const header = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    const bearerToken = header?.startsWith("Bearer ")
      ? header.slice(7)
      : this.extractCookie(request, "mm_access");

    if (!bearerToken) {
      return null;
    }

    try {
      const claims = await this.sessionService.verifyAccessToken(
        bearerToken,
        SessionPrincipalType.USER,
      );
      const session = await this.sessionService.requireActiveSession(claims);
      const user = await this.usersRepository.findOneBy({
        id: claims.sub as UserEntity["id"],
      });
      if (
        !user ||
        user.status !== UserStatus.ACTIVE ||
        Number(user.sessionVersion) !== claims.sv
      ) {
        return null;
      }
      return {
        sub: user.id,
        sid: claims.sid,
        jti: claims.jti,
        role: "user",
        sessionVersion: Number(user.sessionVersion),
        deviceUuid: session.deviceUuid,
        login: user.login ?? user.contact,
        displayName: user.displayName,
        contact: user.contact,
        method: user.method,
        phone: user.phone ?? user.contact,
      };
    } catch {
      return null;
    }
  }

  private extractCookie(request: IncomingMessage, name: string): string | null {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return null;
    }
    for (const item of cookieHeader.split(";")) {
      const separator = item.indexOf("=");
      if (separator < 0 || item.slice(0, separator).trim() !== name) {
        continue;
      }
      try {
        return decodeURIComponent(item.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
    return null;
  }

  private async revalidateConnection(client: RealtimeSocket): Promise<void> {
    const user = client.user;
    if (!user || client.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      await this.sessionService.requireActiveSession({
        sub: user.sub,
        sid: user.sid,
        jti: user.jti,
        typ: "access",
        role: SessionPrincipalType.USER,
        sv: user.sessionVersion,
      });
      const account = await this.usersRepository.findOneBy({
        id: user.sub as UserEntity["id"],
      });
      if (
        !account ||
        account.status !== UserStatus.ACTIVE ||
        Number(account.sessionVersion) !== user.sessionVersion
      ) {
        client.close(4001, "Session revoked");
      }
    } catch {
      client.close(4001, "Session revoked");
    }
  }
}
