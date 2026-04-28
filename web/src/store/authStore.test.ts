import { beforeEach, describe, expect, it, vi } from "vitest";
import { authStore } from "./authStore";
import { chatStore } from "./chatStore";
import { realtimeStore } from "./realtimeStore";

const storageMock = (() => {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: storageMock,
});

describe("authStore", () => {
  beforeEach(() => {
    storageMock.clear();
    authStore.setState({
      token: "token",
      currentUser: {
        userID: "user-1",
        displayName: "Anna",
        contact: "+1555",
        method: "phone",
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    chatStore.setState({
      chats: [
        {
          id: "chat-1",
          title: "Demo",
          lastMessagePreview: null,
          lastActivity: new Date().toISOString(),
          unreadCount: 0,
          typingParticipants: [],
          participantNames: [],
          participantCount: 2,
        },
      ],
      messagesByChatId: {
        "chat-1": [],
      },
      selectedChatId: "chat-1",
      isLoadingChats: false,
      isLoadingMessages: false,
      error: null,
    });
  });

  it("logout clears auth, chat, and realtime state", () => {
    const clearSpy = vi.spyOn(realtimeStore.getState(), "clear");

    authStore.getState().logout();

    expect(authStore.getState().token).toBeNull();
    expect(authStore.getState().currentUser).toBeNull();
    expect(chatStore.getState().chats).toHaveLength(0);
    expect(chatStore.getState().selectedChatId).toBeNull();
    expect(clearSpy).toHaveBeenCalled();
  });
});
