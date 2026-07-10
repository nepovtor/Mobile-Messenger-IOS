import { chatApi } from "@/features/chat/api/chatApi";
import { realtimeStore } from "@/features/chat/model/realtimeStore";
import type { Message } from "@/features/chat/types/message";

export async function deliverTextMessage(input: {
  chatId: string;
  text: string;
  clientMessageId: string;
}): Promise<Message | null> {
  try {
    realtimeStore.getState().sendEvent("message.send", {
      chatID: input.chatId,
      clientMessageId: input.clientMessageId,
      kind: "text",
      text: input.text,
    });
    return null;
  } catch {
    return chatApi.sendMessageREST(
      input.chatId,
      input.text,
      input.clientMessageId,
    );
  }
}
