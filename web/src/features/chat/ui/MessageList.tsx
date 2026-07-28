import { MessageCircleMore } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Message } from "@/features/chat/types/message";
import { formatMessageDayLabel, isSameMessageDay } from "@/utils/date";
import { Skeleton } from "@/components/ui/Skeleton";
import { MessageBubble } from "@/features/chat/ui/MessageBubble";

export function MessageList({
  messages,
  currentUserId,
  isLoading,
  typingParticipants,
  showAuthors,
  onRetry,
  onEditMessage,
  onDeleteMessage,
}: {
  messages: Message[];
  currentUserId: string;
  isLoading: boolean;
  typingParticipants: string[];
  showAuthors: boolean;
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
      <div className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-5">
        <Skeleton className="h-16 w-2/3 rounded-[18px]" />
        <Skeleton className="ml-auto h-20 w-3/4 rounded-[18px]" />
        <Skeleton className="h-16 w-1/2 rounded-[18px]" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.04] text-cyan-100 shadow-[0_18px_40px_rgba(5,12,24,0.22)]">
            <MessageCircleMore className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">
            Нет сообщений
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Напишите первое сообщение
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-5">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const isOwn = message.authorID === currentUserId;
        const showAuthor =
          showAuthors && !previous
            ? true
            : showAuthors && previous.authorID !== message.authorID;
        const showDayDivider =
          !previous || !isSameMessageDay(previous.createdAt, message.createdAt);

        return (
          <div
            key={`${message.id}:${message.clientMessageId ?? ""}`}
            className="space-y-2"
          >
            {showDayDivider ? (
              <div className="flex justify-center py-1">
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-slate-400">
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
          <div className="rounded-[20px] rounded-bl-md bg-white/[0.05] px-3 py-2 text-sm text-cyan-200">
            {typingParticipants.join(", ")} печатает...
          </div>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
