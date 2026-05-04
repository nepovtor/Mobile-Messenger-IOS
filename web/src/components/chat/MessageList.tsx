import { MessageCircleMore } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Message } from "../../types/message";
import { formatMessageDayLabel, isSameMessageDay } from "../../utils/date";
import { Skeleton } from "../ui/Skeleton";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  messages,
  currentUserId,
  isLoading,
  typingParticipants,
  onRetry,
  onEditMessage,
  onDeleteMessage,
}: {
  messages: Message[];
  currentUserId: string;
  isLoading: boolean;
  typingParticipants: string[];
  onRetry: (clientMessageId: string) => void;
  onEditMessage: (messageId: string, text: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingParticipants]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-6">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-20 w-3/4" />
        <Skeleton className="h-16 w-1/2" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-[28px] border border-dashed border-white/10 bg-white/[0.04] px-6 py-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
            <MessageCircleMore className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-white">
            Start the first exchange
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This chat is ready for realtime messages. Send the first message to
            show delivery, read states, and live updates during the demo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-6">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const isOwn = message.authorID === currentUserId;
        const showAuthor = !previous || previous.authorID !== message.authorID;
        const showDayDivider =
          !previous || !isSameMessageDay(previous.createdAt, message.createdAt);

        return (
          <div
            key={`${message.id}:${message.clientMessageId ?? ""}`}
            className="space-y-3"
          >
            {showDayDivider ? (
              <div className="flex justify-center py-1">
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {formatMessageDayLabel(message.createdAt)}
                </span>
              </div>
            ) : null}

            <MessageBubble
              message={message}
              isOwn={isOwn}
              showAuthor={showAuthor}
              onEditMessage={
                isOwn && !message.deletedAt
                  ? (text) => onEditMessage(message.id, text)
                  : undefined
              }
              onDeleteMessage={
                isOwn && !message.deletedAt
                  ? () => onDeleteMessage(message.id)
                  : undefined
              }
              onRetry={
                message.clientMessageId && message.status === "failed"
                  ? () => onRetry(message.clientMessageId!)
                  : undefined
              }
            />
          </div>
        );
      })}

      {typingParticipants.length > 0 ? (
        <div className="flex justify-start">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-cyan-100 backdrop-blur-xl">
            {typingParticipants.join(", ")} typing…
          </div>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
