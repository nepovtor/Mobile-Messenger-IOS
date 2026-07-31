import type { ChatSummary } from "@/features/chat/types/chat";
import type { Message } from "@/features/chat/types/message";
import { httpRequest } from "@/shared/api/httpClient";
import { apiPath } from "@/shared/api/generated/apiContract";

export const chatApi = {
  getChats() {
    return httpRequest<ChatSummary[]>(apiPath("listChats"));
  },
  createChat(title: string, participantContacts: string[]) {
    return httpRequest<ChatSummary>(apiPath("createChat"), {
      method: "POST",
      body: JSON.stringify({
        title,
        participantContacts,
      }),
    });
  },
  getMessages(chatId: string) {
    return httpRequest<Message[]>(
      `${apiPath("listMessages", { chatID: chatId })}?limit=100`,
    );
  },
  sendMessageREST(chatId: string, text: string, clientMessageId: string) {
    return httpRequest<Message>(apiPath("sendMessage", { chatID: chatId }), {
      method: "POST",
      body: JSON.stringify({
        messageID: clientMessageId,
        kind: "text",
        text,
      }),
    });
  },
  updateMessage(chatId: string, messageId: string, text: string) {
    return httpRequest<Message>(
      apiPath("updateMessage", { chatID: chatId, messageID: messageId }),
      {
        method: "PATCH",
        body: JSON.stringify({ text }),
      },
    );
  },
  deleteMessage(chatId: string, messageId: string) {
    return httpRequest<Message>(
      apiPath("deleteMessage", { chatID: chatId, messageID: messageId }),
      { method: "DELETE" },
    );
  },
  markRead(chatId: string, messageId: string) {
    return httpRequest<{ ok: true }>(
      apiPath("markMessageRead", { chatID: chatId, messageID: messageId }),
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
    }>(apiPath("setTyping", { chatID: chatId }), {
      method: "POST",
      body: JSON.stringify({ isTyping }),
    });
  },
};
