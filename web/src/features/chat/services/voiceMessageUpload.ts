import { chatApi } from "@/features/chat/api/chatApi";
import type { Message } from "@/features/chat/types/message";

export const MAX_VOICE_MESSAGE_BYTES = 20_000_000;

export function normalizeVoiceMimeType(
  mimeType: string,
): "audio/mp4" | "audio/webm" {
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "audio/mp4" || normalized === "audio/webm") {
    return normalized;
  }
  throw new Error("Этот формат голосового сообщения не поддерживается.");
}

export async function uploadVoiceMessage(input: {
  chatId: string;
  recording: Blob;
  clientMessageId: string;
}): Promise<Message> {
  if (input.recording.size === 0) {
    throw new Error("Запись получилась пустой. Попробуйте ещё раз.");
  }
  if (input.recording.size > MAX_VOICE_MESSAGE_BYTES) {
    throw new Error("Голосовое сообщение слишком большое.");
  }

  const mimeType = normalizeVoiceMimeType(input.recording.type);
  const recording =
    input.recording.type === mimeType
      ? input.recording
      : input.recording.slice(0, input.recording.size, mimeType);
  const target = await chatApi.uploadVoice(recording, mimeType);
  return chatApi.sendAudioMessageREST(
    input.chatId,
    target.mediaID,
    input.clientMessageId,
  );
}
