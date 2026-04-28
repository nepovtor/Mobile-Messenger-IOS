import type { ChatSummary } from "../types/chat";
import type { Message } from "../types/message";
import { httpRequest } from "./httpClient";

export const chatApi = {
  getChats() {
    return httpRequest<ChatSummary[]>("/chats");
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
  markRead(chatId: string, messageId: string) {
    return httpRequest<{ ok: true }>(`/chats/${chatId}/messages/${messageId}/read`, {
      method: "POST",
    });
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
