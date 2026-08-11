import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Message, MessageStatus } from "@/features/chat/types/message";
import { MessageBubble } from "@/features/chat/ui/MessageBubble";

function buildMessage(status: MessageStatus): Message {
  return {
    id: `message-${status}`,
    messageID: `message-${status}`,
    chatID: "chat-1",
    authorID: "user-1",
    authorName: "Anna",
    kind: "text",
    text: "Hello there",
    mediaID: null,
    mediaURL: null,
    status,
    createdAt: "2026-05-04T12:30:00.000Z",
    editedAt: null,
    deletedAt: null,
    clientMessageId: `local-${status}`,
    error: status === "failed" ? "Network error" : null,
  };
}

describe("MessageBubble", () => {
  it.each([
    ["sending", "Отправляется"],
    ["sent", "Отправлено"],
    ["delivered", "Доставлено"],
    ["read", "Прочитано"],
    ["failed", "Не отправлено"],
  ] as const)("renders %s message status", (status, label) => {
    render(
      <MessageBubble
        message={buildMessage(status)}
        isOwn
        showAuthor={false}
        onRetry={status === "failed" ? vi.fn() : undefined}
      />,
    );

    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("renders a playable voice message when media is available", () => {
    const message: Message = {
      ...buildMessage("delivered"),
      kind: "audio",
      text: null,
      mediaID: "voice-1",
      mediaURL: "https://storage.example.test/voice.m4a",
    };

    render(<MessageBubble message={message} isOwn showAuthor={false} />);

    const player = screen.getByLabelText("Голосовое сообщение");
    expect(player).toHaveAttribute("src", message.mediaURL);
  });

  it("explains when a voice attachment has no download URL", () => {
    const message: Message = {
      ...buildMessage("delivered"),
      kind: "audio",
      text: null,
      mediaID: "voice-1",
      mediaURL: null,
    };

    render(
      <MessageBubble message={message} isOwn={false} showAuthor={false} />,
    );

    expect(
      screen.getByText("Голосовое сообщение недоступно"),
    ).toBeInTheDocument();
  });
});
