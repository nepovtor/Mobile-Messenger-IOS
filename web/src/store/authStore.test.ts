import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "../api/authApi";
import { authStore } from "./authStore";
import { chatStore } from "./chatStore";
import { realtimeStore } from "./realtimeStore";

vi.mock("../api/authApi", () => ({
  authApi: {
    login: vi.fn(),
    getMe: vi.fn(),
  },
}));

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

  it("stores the token before requesting current user during login", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: "fresh-token",
      userID: "user-2",
      displayName: "Boris",
    });
    vi.mocked(authApi.getMe).mockImplementation(async () => {
      expect(authStore.getState().token).toBe("fresh-token");

      return {
        userID: "user-2",
        displayName: "Boris",
        contact: "+15550002",
        method: "phone",
      };
    });

    await authStore.getState().login({
      method: "phone",
      contact: "+15550002",
      password: "demo2222",
    });

    expect(authStore.getState().currentUser?.displayName).toBe("Boris");
    expect(authStore.getState().token).toBe("fresh-token");
  });
});
