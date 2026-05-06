import { create } from "zustand";
import { chatApi } from "../api/chatApi";
import type { ChatSummary, MessagesByChatId } from "../types/chat";
import type { Message } from "../types/message";
import { dedupeMessages, upsertMessage } from "../utils/messageDedup";
import { realtimeStore } from "./realtimeStore";
import { toastStore } from "./toastStore";

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
    editedAt: null,
    deletedAt: null,
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
  updateMessage: (chatId: string, message: Message) => void;
  removeMessage: (chatId: string, message: Message) => void;
  editMessage: (
    chatId: string,
    messageId: string,
    text: string,
  ) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  markMessageFailed: (
    chatId: string,
    clientMessageId: string,
    reason: string,
  ) => void;
  markMessageRead: (chatId: string, messageId: string) => void;
  updateTyping: (chatId: string, typingParticipants: string[]) => void;
  clearError: () => void;
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
    set((state) => buildMessageState(state, chatId, message));
  },
  updateMessage(chatId, message) {
    set((state) => buildMessageState(state, chatId, message));
  },
  removeMessage(chatId, message) {
    set((state) => buildMessageState(state, chatId, message));
  },
  async editMessage(chatId, messageId, text) {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }
    const updated = await chatApi.updateMessage(chatId, messageId, trimmedText);
    get().updateMessage(chatId, updated);
  },
  async deleteMessage(chatId, messageId) {
    const deleted = await chatApi.deleteMessage(chatId, messageId);
    get().removeMessage(chatId, deleted);
  },
  markMessageFailed(chatId, clientMessageId, reason) {
    toastStore.getState().showToast({
      tone: "danger",
      title: "Сообщение",
      message: reason,
      dedupeKey: `message-failed:${clientMessageId}`,
    });

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
  clearError() {
    set({ error: null });
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

function buildMessageState(
  state: ChatStore,
  chatId: string,
  message: Message,
): Pick<ChatStore, "messagesByChatId" | "chats"> {
  const messages = upsertMessage(state.messagesByChatId[chatId] ?? [], {
    ...message,
    clientMessageId: message.clientMessageId ?? message.messageID,
  });
  const lastMessage = messages[messages.length - 1] ?? null;
  const chats = state.chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          lastMessagePreview: lastMessage
            ? lastMessage.deletedAt
              ? "Message deleted"
              : lastMessage.kind === "image"
                ? "Photo"
                : lastMessage.text
            : chat.lastMessagePreview,
          lastActivity: lastMessage?.createdAt ?? chat.lastActivity,
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
}
