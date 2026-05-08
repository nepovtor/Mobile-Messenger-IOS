import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { contactsApi } from "../../api/contactsApi";
import { AppShell } from "./AppShell";
import { chatStore } from "../../store/chatStore";
import { realtimeStore } from "../../store/realtimeStore";
import { toastStore } from "../../store/toastStore";
import type { CurrentUser } from "../../types/auth";

vi.mock("../../api/contactsApi", () => ({
  contactsApi: {
    getContacts: vi.fn(),
  },
}));

vi.mock("./Sidebar", () => ({
  Sidebar: ({
    chats,
    onSelectChat,
  }: {
    chats: Array<{ id: string }>;
    onSelectChat: (chatId: string) => void;
  }) => (
    <div data-testid="sidebar">
      {chats.map((chat) => (
        <button
          key={chat.id}
          type="button"
          data-testid={`select-${chat.id}`}
          onClick={() => onSelectChat(chat.id)}
        >
          {chat.id}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./ChatPanel", () => ({
  ChatPanel: ({ chat }: { chat: { id: string } }) => (
    <div data-testid="chat-panel">{chat.id}</div>
  ),
}));

vi.mock("../chat/ConnectionBadge", () => ({
  ConnectionBadge: () => <div data-testid="connection-badge" />,
}));

const currentUser: CurrentUser = {
  userID: "user-1",
  displayName: "Anna",
  contact: "+15550001",
  method: "phone",
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function resetChatStore() {
  chatStore.setState({
    chats: [],
    messagesByChatId: {},
    selectedChatId: null,
    isLoadingChats: false,
    isLoadingMessages: false,
    error: null,
  });
}

describe("AppShell chatId navigation", () => {
  beforeEach(() => {
    cleanup();
    resetChatStore();
    realtimeStore.setState({
      client: null,
      connectionState: "connected",
      lastError: null,
    });
    toastStore.getState().clear();
    vi.mocked(contactsApi.getContacts).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    toastStore.getState().clear();
  });

  it("keeps chatId in the URL until chats load and then opens that chat", async () => {
    render(
      <MemoryRouter initialEntries={["/messenger?chatId=chat-2"]}>
        <LocationProbe />
        <AppShell
          currentUser={currentUser}
          onLogout={() => undefined}
          onUpdateDisplayName={async () => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?chatId=chat-2",
    );
    expect(chatStore.getState().selectedChatId).toBeNull();

    act(() => {
      chatStore.setState({
        chats: [
          {
            id: "chat-2",
            title: "Product",
            lastMessagePreview: null,
            lastActivity: new Date().toISOString(),
            unreadCount: 0,
            typingParticipants: [],
            participantNames: ["Anna", "Boris"],
            participantCount: 2,
          },
        ],
        messagesByChatId: {
          "chat-2": [],
        },
      });
    });

    await waitFor(() => {
      expect(chatStore.getState().selectedChatId).toBe("chat-2");
    });

    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?chatId=chat-2",
    );
    expect(screen.getByTestId("chat-panel")).toHaveTextContent("chat-2");
  });

  it("does not jump back to the previous chat when selecting a new one", async () => {
    act(() => {
      chatStore.setState({
        chats: [
          {
            id: "chat-1",
            title: "General",
            lastMessagePreview: null,
            lastActivity: new Date().toISOString(),
            unreadCount: 0,
            typingParticipants: [],
            participantNames: ["Anna", "Boris"],
            participantCount: 2,
          },
          {
            id: "chat-2",
            title: "Product",
            lastMessagePreview: null,
            lastActivity: new Date().toISOString(),
            unreadCount: 0,
            typingParticipants: [],
            participantNames: ["Anna", "Clare"],
            participantCount: 2,
          },
        ],
        messagesByChatId: {
          "chat-1": [],
          "chat-2": [],
        },
        selectedChatId: "chat-1",
      });
    });

    render(
      <MemoryRouter initialEntries={["/messenger?chatId=chat-1"]}>
        <LocationProbe />
        <AppShell
          currentUser={currentUser}
          onLogout={() => undefined}
          onUpdateDisplayName={async () => undefined}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-panel")).toHaveTextContent("chat-1");
    });

    act(() => {
      screen.getByTestId("select-chat-2").click();
    });

    await waitFor(() => {
      expect(chatStore.getState().selectedChatId).toBe("chat-2");
    });

    expect(screen.getByTestId("chat-panel")).toHaveTextContent("chat-2");
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?chatId=chat-2",
    );
  });
});
