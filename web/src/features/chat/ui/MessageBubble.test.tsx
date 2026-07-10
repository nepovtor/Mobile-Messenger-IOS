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
});
