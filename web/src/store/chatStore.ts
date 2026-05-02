import { create } from "zustand";
import { chatApi } from "../api/chatApi";
import type { ChatSummary, MessagesByChatId } from "../types/chat";
import type { Message } from "../types/message";
import { dedupeMessages, upsertMessage } from "../utils/messageDedup";
import { realtimeStore } from "./realtimeStore";

function createLocalMessage(
  chatId: string,
  text: string,
  clientMessageId: string,
  authorID: string,
  authorName: string,
): Message {
  return {
    id: clientMessageId,
    messageID: clientMessageId,
    clientMessageId,
    chatID: chatId,
    authorID,
    authorName,
    kind: "text",
    text,
    mediaID: null,
    mediaURL: null,
    status: "sending",
    createdAt: new Date().toISOString(),
    error: null,
    isLocal: true,
  };
}

type ChatStore = {
  chats: ChatSummary[];
  messagesByChatId: MessagesByChatId;
  selectedChatId: string | null;
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  selectChat: (chatId: string) => void;
  sendMessage: (
    chatId: string,
    text: string,
    currentUser: { userID: string; displayName: string },
  ) => Promise<void>;
  retryMessage: (
    chatId: string,
    clientMessageId: string,
    currentUser: { userID: string; displayName: string },
  ) => Promise<void>;
  upsertMessage: (chatId: string, message: Message) => void;
  markMessageFailed: (
    chatId: string,
    clientMessageId: string,
    reason: string,
  ) => void;
  markMessageRead: (chatId: string, messageId: string) => void;
  updateTyping: (chatId: string, typingParticipants: string[]) => void;
  clear: () => void;
};

export const chatStore = create<ChatStore>((set, get) => ({
  chats: [],
  messagesByChatId: {},
  selectedChatId: null,
  isLoadingChats: false,
  isLoadingMessages: false,
  error: null,
  async loadChats() {
    set({ isLoadingChats: true, error: null });
    try {
      const chats = await chatApi.getChats();
      set({ chats, isLoadingChats: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load chats.",
        isLoadingChats: false,
      });
    }
  },
  async loadMessages(chatId) {
    set({ isLoadingMessages: true, error: null });
    try {
      const messages = await chatApi.getMessages(chatId);
      set((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: dedupeMessages(messages),
        },
        isLoadingMessages: false,
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to load messages.",
        isLoadingMessages: false,
      });
    }
  },
  selectChat(chatId) {
    set({ selectedChatId: chatId });
  },
  async sendMessage(chatId, text, currentUser) {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const localMessage = createLocalMessage(
      chatId,
      trimmedText,
      clientMessageId,
      currentUser.userID,
      currentUser.displayName,
    );
    get().upsertMessage(chatId, localMessage);

    const sendViaRestFallback = async () => {
      try {
        const persisted = await chatApi.sendMessageREST(
          chatId,
          trimmedText,
          clientMessageId,
        );
        get().upsertMessage(chatId, {
          ...persisted,
          clientMessageId,
          status: persisted.status === "sending" ? "sent" : persisted.status,
          error: null,
          isLocal: false,
        });
        await get().loadChats();
      } catch (error) {
        get().markMessageFailed(
          chatId,
          clientMessageId,
          error instanceof Error ? error.message : "Message send failed.",
        );
      }
    };

    try {
      realtimeStore.getState().sendEvent("message.send", {
        chatID: chatId,
        clientMessageId,
        kind: "text",
        text: trimmedText,
      });
    } catch {
      await sendViaRestFallback();
    }
  },
  async retryMessage(chatId, clientMessageId, currentUser) {
    const message = (get().messagesByChatId[chatId] ?? []).find(
      (item) => item.clientMessageId === clientMessageId,
    );
    if (!message?.text) {
      return;
    }

    set((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [chatId]: (state.messagesByChatId[chatId] ?? []).filter(
          (item) => item.clientMessageId !== clientMessageId,
        ),
      },
    }));
    await get().sendMessage(chatId, message.text, currentUser);
  },
  upsertMessage(chatId, message) {
    set((state) => {
      const messages = upsertMessage(state.messagesByChatId[chatId] ?? [], {
        ...message,
        clientMessageId: message.clientMessageId ?? message.messageID,
      });
      const chats = state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              lastMessagePreview:
                message.kind === "image" ? "Photo" : message.text,
              lastActivity: message.createdAt,
            }
          : chat,
      );

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: messages,
        },
        chats: chats.sort(
          (left, right) =>
            new Date(right.lastActivity).getTime() -
            new Date(left.lastActivity).getTime(),
        ),
      };
    });
  },
  markMessageFailed(chatId, clientMessageId, reason) {
    set((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [chatId]: (state.messagesByChatId[chatId] ?? []).map((message) =>
          message.clientMessageId === clientMessageId
            ? {
                ...message,
                status: "failed",
                error: reason,
              }
            : message,
        ),
      },
      error: reason,
    }));
  },
  markMessageRead(chatId, messageId) {
    set((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [chatId]: (state.messagesByChatId[chatId] ?? []).map((message) =>
          message.id === messageId || message.messageID === messageId
            ? { ...message, status: "read" }
            : message,
        ),
      },
    }));
  },
  updateTyping(chatId, typingParticipants) {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId ? { ...chat, typingParticipants } : chat,
      ),
    }));
  },
  clear() {
    set({
      chats: [],
      messagesByChatId: {},
      selectedChatId: null,
      isLoadingChats: false,
      isLoadingMessages: false,
      error: null,
    });
  },
}));
