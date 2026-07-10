import { appConfig } from "@/config/api";
import type {
  ConnectionState,
  MessageAckEvent,
  MessageCreatedEvent,
  MessageFailedEvent,
  RealtimeEnvelope,
  ReadEvent,
  TypingEvent,
} from "@/features/chat/realtime/realtimeTypes";

type RealtimeHandlers = {
  onConnectionStateChange?: (
    state: ConnectionState,
    reason?: string,
    retryCount?: number,
  ) => void;
  onEvent?: (event: RealtimeEnvelope) => void;
};

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private reconnectTimer: number | null = null;
  private shouldReconnect = false;
  private retryCount = 0;
  private handlers: RealtimeHandlers;

  constructor(handlers: RealtimeHandlers = {}) {
    this.handlers = handlers;
  }

  connect(token: string) {
    this.token = token;
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(manual = true) {
    this.shouldReconnect = !manual;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close(1000, manual ? "logout" : "disconnect");
    }
    if (manual) {
      this.retryCount = 0;
      this.handlers.onConnectionStateChange?.("disconnected");
    }
  }

  sendEvent(event: string, data: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket disconnected");
    }

    this.socket.send(JSON.stringify({ event, data }));
  }

  private openSocket() {
    if (!this.token) {
      this.handlers.onConnectionStateChange?.(
        "failed",
        "Missing session token.",
      );
      return;
    }

    const state = this.retryCount === 0 ? "connecting" : "reconnecting";
    this.handlers.onConnectionStateChange?.(state, undefined, this.retryCount);

    const url = new URL(appConfig.websocketUrl);
    url.searchParams.set("token", this.token);

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.onopen = () => {
      this.retryCount = 0;
    };

    socket.onmessage = (message) => {
      try {
        const envelope = JSON.parse(message.data) as RealtimeEnvelope;
        if (envelope.event === "connection.ready") {
          this.handlers.onConnectionStateChange?.("connected");
          return;
        }
        this.handlers.onEvent?.(envelope);
      } catch {
        this.handlers.onConnectionStateChange?.(
          "failed",
          "Realtime event decoding failed.",
        );
      }
    };

    socket.onerror = () => {
      this.handlers.onConnectionStateChange?.(
        "failed",
        "Realtime connection failed.",
      );
    };

    socket.onclose = (event) => {
      if (!this.shouldReconnect) {
        this.handlers.onConnectionStateChange?.("disconnected");
        return;
      }
      if (event.code === 4001) {
        this.shouldReconnect = false;
        this.handlers.onConnectionStateChange?.(
          "failed",
          "Session expired. Please sign in again.",
        );
        return;
      }

      this.retryCount += 1;
      this.handlers.onConnectionStateChange?.(
        "reconnecting",
        "Reconnecting to realtime…",
        this.retryCount,
      );
      const delay = Math.min(1000 * 2 ** (this.retryCount - 1), 10000);
      this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
    };
  }
}

export function decodeRealtimeEvent(envelope: RealtimeEnvelope) {
  switch (envelope.event) {
    case "message.created":
      return envelope.data as MessageCreatedEvent;
    case "message.send.ack":
      return envelope.data as MessageAckEvent;
    case "message.failed":
      return envelope.data as MessageFailedEvent;
    case "typing.started":
    case "typing.stopped":
      return envelope.data as TypingEvent;
    case "message.read":
      return envelope.data as ReadEvent;
    default:
      return envelope.data;
  }
}
