import { describe, expect, it } from "vitest";
import { decodeRealtimeEvent } from "@/features/chat/realtime/realtimeClient";

describe("decodeRealtimeEvent", () => {
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
