import { afterEach, describe, expect, it, vi } from "vitest";
import { chatApi } from "@/features/chat/api/chatApi";
import {
  MAX_VOICE_MESSAGE_BYTES,
  normalizeVoiceMimeType,
  uploadVoiceMessage,
} from "@/features/chat/services/voiceMessageUpload";
import type { Message } from "@/features/chat/types/message";

const sentMessage: Message = {
  id: "message-1",
  messageID: "message-1",
  clientMessageId: "client-1",
  chatID: "chat-1",
  authorID: "user-1",
  authorName: "Anna",
  kind: "audio",
  text: null,
  mediaID: "media-1",
  mediaURL: "https://storage.example.test/voice.m4a",
  status: "delivered",
  createdAt: "2026-08-11T18:00:00.000Z",
  editedAt: null,
  deletedAt: null,
  error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("voiceMessageUpload", () => {
  it("normalizes recorder content types", () => {
    expect(normalizeVoiceMimeType("audio/mp4;codecs=mp4a.40.2")).toBe(
      "audio/mp4",
    );
    expect(normalizeVoiceMimeType("audio/webm; codecs=opus")).toBe(
      "audio/webm",
    );
  });

  it("uploads through the API before creating the chat message", async () => {
    const upload = vi.spyOn(chatApi, "uploadVoice").mockResolvedValue({
      mediaID: "media-1",
      status: "uploaded",
    });
    const send = vi
      .spyOn(chatApi, "sendAudioMessageREST")
      .mockResolvedValue(sentMessage);
    const recording = new Blob([new Uint8Array([1, 2, 3])], {
      type: "audio/mp4;codecs=mp4a.40.2",
    });

    await expect(
      uploadVoiceMessage({
        chatId: "chat-1",
        recording,
        clientMessageId: "client-1",
      }),
    ).resolves.toEqual(sentMessage);

    expect(upload).toHaveBeenCalledWith(expect.any(Blob), "audio/mp4");
    expect(send).toHaveBeenCalledWith("chat-1", "media-1", "client-1");
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects empty and oversized recordings before making a request", async () => {
    const upload = vi.spyOn(chatApi, "uploadVoice");

    await expect(
      uploadVoiceMessage({
        chatId: "chat-1",
        recording: new Blob([], { type: "audio/mp4" }),
        clientMessageId: "empty",
      }),
    ).rejects.toThrow("Запись получилась пустой");
    await expect(
      uploadVoiceMessage({
        chatId: "chat-1",
        recording: {
          size: MAX_VOICE_MESSAGE_BYTES + 1,
          type: "audio/mp4",
        } as Blob,
        clientMessageId: "large",
      }),
    ).rejects.toThrow("Голосовое сообщение слишком большое");

    expect(upload).not.toHaveBeenCalled();
  });
});
