import { beforeEach, describe, expect, it } from "vitest";
import { chatStore } from "./chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    chatStore.getState().clear();
    chatStore.setState({
      chats: [
        {
          id: "chat-1",
          title: "Chat",
          lastMessagePreview: null,
          lastActivity: "2026-04-28T09:00:00.000Z",
          unreadCount: 0,
          typingParticipants: [],
          participantNames: [],
          participantCount: 2,
        },
      ],
    });
  });

  it("ack updates message state to sent", () => {
    chatStore.getState().upsertMessage("chat-1", {
      id: "client-1",
      messageID: "client-1",
      clientMessageId: "client-1",
      chatID: "chat-1",
      authorID: "user-1",
      authorName: "Anna",
      kind: "text",
      text: "Ping",
      mediaID: null,
      mediaURL: null,
      status: "sending",
      createdAt: "2026-04-28T09:00:00.000Z",
    });
    chatStore.getState().upsertMessage("chat-1", {
      id: "server-1",
      messageID: "client-1",
      clientMessageId: "client-1",
      chatID: "chat-1",
      authorID: "user-1",
      authorName: "Anna",
      kind: "text",
      text: "Ping",
      mediaID: null,
      mediaURL: null,
      status: "sent",
      createdAt: "2026-04-28T09:00:01.000Z",
    });

    expect(chatStore.getState().messagesByChatId["chat-1"]).toHaveLength(1);
    expect(chatStore.getState().messagesByChatId["chat-1"][0].status).toBe(
      "sent",
    );
  });

  it("failed messages are marked failed with reason", () => {
    chatStore.getState().upsertMessage("chat-1", {
      id: "client-2",
      messageID: "client-2",
      clientMessageId: "client-2",
      chatID: "chat-1",
      authorID: "user-1",
      authorName: "Anna",
      kind: "text",
      text: "Ping",
      mediaID: null,
      mediaURL: null,
      status: "sending",
      createdAt: "2026-04-28T09:00:00.000Z",
    });
    chatStore
      .getState()
      .markMessageFailed("chat-1", "client-2", "Network down");

    expect(chatStore.getState().messagesByChatId["chat-1"][0].status).toBe(
      "failed",
    );
    expect(chatStore.getState().messagesByChatId["chat-1"][0].error).toBe(
      "Network down",
    );
  });
});
