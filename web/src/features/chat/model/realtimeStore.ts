import { create } from "zustand";
import {
  RealtimeClient,
  decodeRealtimeEvent,
} from "@/features/chat/realtime/realtimeClient";
import type {
  ConnectionState,
  RealtimeEnvelope,
} from "@/features/chat/realtime/realtimeTypes";

type RealtimeStore = {
  client: RealtimeClient | null;
  connectionState: ConnectionState;
  lastError: string | null;
  connect: (onEvent: (event: RealtimeEnvelope) => void) => void;
  disconnect: () => void;
  reconnect: () => void;
  sendEvent: (event: string, data: unknown) => void;
  clear: () => void;
};

export const realtimeStore = create<RealtimeStore>((set, get) => ({
  client: null,
  connectionState: "disconnected",
  lastError: null,
  connect: (onEvent) => {
    get().client?.disconnect(true);

    const client = new RealtimeClient({
      onConnectionStateChange: (connectionState, reason) => {
        set({
          connectionState,
          lastError: reason ?? null,
        });
      },
      onEvent: (event) => {
        decodeRealtimeEvent(event);
        onEvent(event);
      },
    });

    set({ client, lastError: null, connectionState: "connecting" });
    client.connect();
  },
  disconnect: () => {
    get().client?.disconnect(true);
    set({ connectionState: "disconnected", client: null });
  },
  reconnect: () => {
    const client = get().client;
    if (!client) {
      return;
    }
    client.disconnect(false);
  },
  sendEvent: (event, data) => {
    get().client?.sendEvent(event, data);
  },
  clear: () => {
    get().client?.disconnect(true);
    set({
      client: null,
      connectionState: "disconnected",
      lastError: null,
    });
  },
}));
