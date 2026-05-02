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

  it("message updates keep edited marker fields", () => {
    chatStore.getState().upsertMessage("chat-1", {
      id: "server-1",
      messageID: "client-1",
      chatID: "chat-1",
      authorID: "user-1",
      authorName: "Anna",
      kind: "text",
      text: "Before",
      mediaID: null,
      mediaURL: null,
      status: "sent",
      createdAt: "2026-04-28T09:00:00.000Z",
      editedAt: null,
      deletedAt: null,
    });

    chatStore.getState().updateMessage("chat-1", {
      id: "server-1",
      messageID: "client-1",
      chatID: "chat-1",
      authorID: "user-1",
      authorName: "Anna",
      kind: "text",
      text: "After",
      mediaID: null,
      mediaURL: null,
      status: "sent",
      createdAt: "2026-04-28T09:00:00.000Z",
      editedAt: "2026-04-28T09:05:00.000Z",
      deletedAt: null,
    });

    expect(chatStore.getState().messagesByChatId["chat-1"][0].text).toBe(
      "After",
    );
    expect(chatStore.getState().messagesByChatId["chat-1"][0].editedAt).toBe(
      "2026-04-28T09:05:00.000Z",
    );
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
      editedAt: null,
      deletedAt: null,
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
      editedAt: null,
      deletedAt: null,
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
      editedAt: null,
      deletedAt: null,
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
