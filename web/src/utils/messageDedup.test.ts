import { describe, expect, it } from "vitest";
import { dedupeMessages, upsertMessage } from "./messageDedup";
import type { Message } from "../types/message";

const baseMessage: Message = {
  id: "server-1",
  messageID: "client-1",
  clientMessageId: "client-1",
  chatID: "chat-1",
  authorID: "user-1",
  authorName: "Anna",
  kind: "text",
  text: "Hello",
  mediaID: null,
  mediaURL: null,
  status: "sending",
  createdAt: "2026-04-28T09:00:00.000Z",
};

describe("messageDedup", () => {
  it("deduplicates ack and broadcast for the same message", () => {
    const result = dedupeMessages([
      baseMessage,
      {
        ...baseMessage,
        id: "server-2",
        status: "sent",
      },
      {
        ...baseMessage,
        id: "server-2",
        status: "delivered",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server-2");
    expect(result[0].status).toBe("delivered");
  });

  it("upserts a new server version over the local sending version", () => {
    const result = upsertMessage([baseMessage], {
      ...baseMessage,
      id: "server-9",
      status: "sent",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server-9");
    expect(result[0].status).toBe("sent");
  });
});
