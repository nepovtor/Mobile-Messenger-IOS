import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeRealtimeEvent,
  RealtimeClient,
} from "@/features/chat/realtime/realtimeClient";

class WebSocketStub {
  static readonly OPEN = 1;
  static instances: WebSocketStub[] = [];

  readonly url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    WebSocketStub.instances.push(this);
  }

  close() {}

  send() {}
}

describe("decodeRealtimeEvent", () => {
  afterEach(() => {
    WebSocketStub.instances = [];
    vi.unstubAllGlobals();
  });

  it("opens a clean cookie-authenticated URL without a query token", () => {
    vi.stubGlobal("WebSocket", WebSocketStub);
    const client = new RealtimeClient();

    client.connect();

    expect(WebSocketStub.instances).toHaveLength(1);
    const socketUrl = new URL(WebSocketStub.instances[0].url);
    expect(socketUrl.search).toBe("");
    expect(socketUrl.hash).toBe("");
    expect(socketUrl.searchParams.has("token")).toBe(false);

    client.disconnect();
  });

  it("returns typed payload for message ack envelopes", () => {
    const result = decodeRealtimeEvent({
      event: "message.send.ack",
      data: {
        chatID: "chat-1",
        clientMessageId: "client-1",
        message: {
          id: "server-1",
        },
      },
    });

    expect(result).toMatchObject({
      chatID: "chat-1",
      clientMessageId: "client-1",
    });
  });
});
