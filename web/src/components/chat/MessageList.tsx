import { useEffect, useMemo, useRef } from "react";
import type { Message } from "../../types/message";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  messages,
  currentUserId,
  onRetry,
  onEditMessage,
  onDeleteMessage,
}: {
  messages: Message[];
  currentUserId: string;
  onRetry: (clientMessageId: string) => void;
  onEditMessage: (messageId: string, text: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const rows = useMemo(
    () =>
      messages.map((message, index) => {
        const previous = messages[index - 1];
        const isOwn = message.authorID === currentUserId;
        const showAuthor = !previous || previous.authorID !== message.authorID;
        return { message, isOwn, showAuthor };
      }),
    [currentUserId, messages],
  );

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
        No messages yet. Start the conversation.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-6">
      {rows.map(({ message, isOwn, showAuthor }) => (
        <MessageBubble
          key={`${message.id}:${message.clientMessageId ?? ""}`}
          message={message}
          isOwn={isOwn}
          showAuthor={showAuthor}
          onEditMessage={
            isOwn && !message.deletedAt ? (text) => onEditMessage(message.id, text) : undefined
          }
          onDeleteMessage={
            isOwn && !message.deletedAt ? () => onDeleteMessage(message.id) : undefined
          }
          onRetry={
            message.clientMessageId
              ? () => onRetry(message.clientMessageId!)
              : undefined
          }
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
