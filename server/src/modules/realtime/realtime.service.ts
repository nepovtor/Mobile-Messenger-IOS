import { Injectable, MessageEvent } from "@nestjs/common";
import { Observable, Subject, interval, map, merge } from "rxjs";
import { WebSocket } from "ws";

export interface RealtimeEventEnvelope<T = unknown> {
  event: string;
  data: T;
}

interface RealtimePayload {
  type: string;
  payload: unknown;
}

@Injectable()
export class RealtimeService {
  private readonly userStreams = new Map<string, Subject<MessageEvent>>();
  private readonly userConnections = new Map<string, Set<WebSocket>>();
  private readonly typingState = new Map<
    string,
    Map<string, { userID: string; displayName: string }>
  >();

  subscribe(userID: string): Observable<MessageEvent> {
    const stream = this.getStream(userID);
    return merge(
      stream.asObservable(),
      interval(15000).pipe(
        map(
          (): MessageEvent => ({
            type: "keepalive",
            data: { timestamp: new Date().toISOString() },
          }),
        ),
      ),
    );
  }

  registerConnection(userID: string, socket: WebSocket): void {
    const sockets = this.userConnections.get(userID) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.userConnections.set(userID, sockets);
  }

  unregisterConnection(userID: string, socket: WebSocket): void {
    const sockets = this.userConnections.get(userID);
    if (!sockets) {
      return;
    }

    sockets.delete(socket);
    if (sockets.size === 0) {
      this.userConnections.delete(userID);
    }
  }

  sendToUser<T>(userID: string, event: RealtimeEventEnvelope<T>): void {
    this.sendEnvelope(userID, event);
    this.getStream(userID).next({
      type: event.event,
      data:
        event.data === null
          ? {}
          : typeof event.data === "string" || typeof event.data === "object"
          ? event.data
          : { value: event.data },
    });
  }

  broadcastToUsers<T>(userIDs: string[], event: RealtimeEventEnvelope<T>): void {
    const uniqueUserIDs = new Set(userIDs);
    for (const userID of uniqueUserIDs) {
      this.sendToUser(userID, event);
    }
  }

  setTyping(
    chatID: string,
    userID: string,
    displayName: string,
    isTyping: boolean,
  ): string[] {
    const chatTyping =
      this.typingState.get(chatID) ??
      new Map<string, { userID: string; displayName: string }>();
    if (isTyping) {
      chatTyping.set(userID, { userID, displayName });
    } else {
      chatTyping.delete(userID);
    }

    if (chatTyping.size === 0) {
      this.typingState.delete(chatID);
      return [];
    }

    this.typingState.set(chatID, chatTyping);
    return Array.from(chatTyping.values()).map((item) => item.displayName);
  }

  getTypingParticipants(chatID: string, excludeUserID?: string): string[] {
    const chatTyping = this.typingState.get(chatID);
    if (!chatTyping) {
      return [];
    }

    return Array.from(chatTyping.values())
      .filter((item) => item.userID !== excludeUserID)
      .map((item) => item.displayName);
  }

  publishToUsers(userIDs: string[], message: RealtimePayload): void {
    this.broadcastToUsers(userIDs, {
      event: message.type,
      data: message.payload,
    });
  }

  broadcastToChatParticipants<T>(
    participants: Array<{ userId: string }>,
    event: RealtimeEventEnvelope<T>,
  ): void {
    this.broadcastToUsers(
      participants.map((participant) => participant.userId),
      event,
    );
  }

  private sendEnvelope<T>(userID: string, event: RealtimeEventEnvelope<T>): void {
    const sockets = this.userConnections.get(userID);
    if (!sockets?.size) {
      return;
    }

    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private getStream(userID: string): Subject<MessageEvent> {
    let stream = this.userStreams.get(userID);
    if (!stream) {
      stream = new Subject<MessageEvent>();
      this.userStreams.set(userID, stream);
    }
    return stream;
  }
}
