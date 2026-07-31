import {
  Injectable,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Observable, Subject, Subscription, interval, map, merge } from "rxjs";
import { WebSocket } from "ws";
import { ChatEventsService } from "../chat-events/chat-events.service";
import {
  getRealtimeHeartbeatIntervalMs,
  getRealtimeHeartbeatTimeoutMs,
} from "../common/runtime-config";

type RealtimePayloadValue = object | string | number | boolean | null;

export interface RealtimeEventEnvelope<T = RealtimePayloadValue> {
  event: string;
  data: T;
}

interface RealtimePayload {
  type: string;
  payload: RealtimePayloadValue;
}

type ConnectionMeta = {
  userID: string;
  deviceUuid: string;
  ipKey: string;
  lastPongAt: number;
  eventWindows: Map<string, { count: number; startedAt: number }>;
  pongListener: () => void;
  closeListener: () => void;
};

const MAX_CONNECTIONS_PER_USER = 8;
const MAX_CONNECTIONS_PER_IP = 24;
const EVENT_RATE_WINDOW_MS = 10_000;
const MAX_EVENTS_PER_TYPE_PER_WINDOW = 60;

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly userStreams = new Map<string, Subject<MessageEvent>>();
  private readonly userConnections = new Map<string, Set<WebSocket>>();
  private readonly ipConnections = new Map<string, Set<WebSocket>>();
  private readonly connectionMeta = new Map<WebSocket, ConnectionMeta>();
  private readonly heartbeatIntervalMs = getRealtimeHeartbeatIntervalMs();
  private readonly heartbeatTimeoutMs = getRealtimeHeartbeatTimeoutMs();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private chatEventsSubscription: Subscription | null = null;

  constructor(
    private readonly chatEvents: ChatEventsService = new ChatEventsService(),
  ) {}

  onModuleInit(): void {
    this.chatEventsSubscription = this.chatEvents.deliveries.subscribe(
      ({ userIDs, envelope }) => this.broadcastToUsers(userIDs, envelope),
    );
    this.heartbeatTimer = setInterval(() => {
      this.flushHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  onModuleDestroy(): void {
    this.chatEventsSubscription?.unsubscribe();
    this.chatEventsSubscription = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

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

  registerConnection(
    userID: string,
    deviceUuid: string,
    socket: WebSocket,
    ipKey = "unknown",
  ): boolean {
    const sockets = this.userConnections.get(userID) ?? new Set<WebSocket>();
    const ipSockets = this.ipConnections.get(ipKey) ?? new Set<WebSocket>();
    if (
      sockets.size >= MAX_CONNECTIONS_PER_USER ||
      ipSockets.size >= MAX_CONNECTIONS_PER_IP
    ) {
      return false;
    }
    sockets.add(socket);
    this.userConnections.set(userID, sockets);
    ipSockets.add(socket);
    this.ipConnections.set(ipKey, ipSockets);

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
      deviceUuid,
      ipKey,
      lastPongAt: Date.now(),
      eventWindows: new Map(),
      pongListener,
      closeListener,
    });
    return true;
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

    const meta = this.connectionMeta.get(socket);
    if (meta) {
      const ipSockets = this.ipConnections.get(meta.ipKey);
      ipSockets?.delete(socket);
      if (ipSockets?.size === 0) {
        this.ipConnections.delete(meta.ipKey);
      }
      socket.off("pong", meta.pongListener);
      socket.off("close", meta.closeListener);
      this.connectionMeta.delete(socket);
    }
  }

  consumeEventQuota(socket: WebSocket, eventType: string): boolean {
    const meta = this.connectionMeta.get(socket);
    if (!meta) {
      return false;
    }
    const now = Date.now();
    const current = meta.eventWindows.get(eventType);
    if (!current || now - current.startedAt >= EVENT_RATE_WINDOW_MS) {
      meta.eventWindows.set(eventType, { count: 1, startedAt: now });
      return true;
    }
    if (current.count >= MAX_EVENTS_PER_TYPE_PER_WINDOW) {
      return false;
    }
    current.count += 1;
    meta.eventWindows.set(eventType, current);
    return true;
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

  sendToDevice<T>(
    userID: string,
    deviceUuid: string,
    event: RealtimeEventEnvelope<T>,
  ): void {
    const sockets = this.userConnections.get(userID);
    if (!sockets?.size) {
      return;
    }
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      const meta = this.connectionMeta.get(socket);
      if (
        meta?.deviceUuid === deviceUuid &&
        socket.readyState === WebSocket.OPEN
      ) {
        socket.send(payload);
      }
    }
  }

  broadcastToUsers<T>(
    userIDs: string[],
    event: RealtimeEventEnvelope<T>,
  ): void {
    const uniqueUserIDs = new Set(userIDs);
    for (const userID of uniqueUserIDs) {
      this.sendToUser(userID, event);
    }
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

  private sendEnvelope<T>(
    userID: string,
    event: RealtimeEventEnvelope<T>,
  ): void {
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

  private flushHeartbeat(): void {
    const now = Date.now();

    for (const [socket, meta] of this.connectionMeta.entries()) {
      if (socket.readyState !== WebSocket.OPEN) {
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

  private getStream(userID: string): Subject<MessageEvent> {
    let stream = this.userStreams.get(userID);
    if (!stream) {
      stream = new Subject<MessageEvent>();
      this.userStreams.set(userID, stream);
    }
    return stream;
  }
}
