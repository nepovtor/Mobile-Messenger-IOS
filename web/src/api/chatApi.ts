import type { ChatSummary } from "../types/chat";
import type { Message } from "../types/message";
import { httpRequest } from "./httpClient";

export const chatApi = {
  getChats() {
    return httpRequest<ChatSummary[]>("/chats");
  },
  createChat(title: string, participantContacts: string[]) {
    return httpRequest<ChatSummary>("/chats", {
      method: "POST",
      body: JSON.stringify({
        title,
        participantContacts,
      }),
    });
  },
  getMessages(chatId: string) {
    return httpRequest<Message[]>(`/chats/${chatId}/messages?limit=100`);
  },
  sendMessageREST(chatId: string, text: string, clientMessageId: string) {
    return httpRequest<Message>(`/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messageID: clientMessageId,
        kind: "text",
        text,
      }),
    });
  },
  updateMessage(chatId: string, messageId: string, text: string) {
    return httpRequest<Message>(`/chats/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    });
  },
  deleteMessage(chatId: string, messageId: string) {
    return httpRequest<Message>(`/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    });
  },
  markRead(chatId: string, messageId: string) {
    return httpRequest<{ ok: true }>(
      `/chats/${chatId}/messages/${messageId}/read`,
      {
        method: "POST",
      },
    );
  },
  setTyping(chatId: string, isTyping: boolean) {
    return httpRequest<{
      chatID: string;
      userID: string;
      isTyping: boolean;
      typingParticipants: string[];
    }>(`/chats/${chatId}/typing`, {
      method: "POST",
      body: JSON.stringify({ isTyping }),
    });
  },
};
