import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import type { ChatSummary } from "../../types/chat";
import type { Message } from "../../types/message";
import type { CurrentUser } from "../../types/auth";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { MessageInput } from "../chat/MessageInput";
import { MessageList } from "../chat/MessageList";

type StatusNotice = {
  tone: "warning" | "danger";
  message: string;
} | null;

export function ChatPanel({
  chat,
  messages,
  currentUser,
  connectionState,
  statusNotice,
  isLoadingMessages,
  onBack,
  onReconnect,
  onSend,
  onRetry,
  onEditMessage,
  onDeleteMessage,
  onTypingStart,
  onTypingStop,
}: {
  chat: ChatSummary;
  messages: Message[];
  currentUser: CurrentUser;
  connectionState: ConnectionState;
  statusNotice: StatusNotice;
  isLoadingMessages: boolean;
  onBack: () => void;
  onReconnect: () => void;
  onSend: (text: string) => Promise<void>;
  onRetry: (clientMessageId: string) => void;
  onEditMessage: (messageId: string, text: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
}) {
  const isDirectChat = chat.participantCount <= 2;
  const subtitle =
    chat.typingParticipants.length > 0
      ? `${chat.typingParticipants.join(", ")} печатает...`
      : isDirectChat
        ? "онлайн"
        : `${chat.participantCount} участников`;

  return (
    <section className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(7,17,29,0.84),rgba(5,12,21,0.94))]">
      <header className="border-b border-white/8 bg-slate-950/40 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-[16px] px-2.5 md:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
            <Avatar
              name={chat.title}
              size="sm"
              className="h-11 w-11 rounded-[16px] text-[11px]"
            />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white sm:text-base">
                {chat.title}
              </h2>
              <p
                className={clsx(
                  "mt-0.5 truncate text-xs",
                  chat.typingParticipants.length > 0
                    ? "text-cyan-200"
                    : "text-slate-400",
                )}
              >
                {subtitle}
              </p>
            </div>
          </div>

          {connectionState !== "connected" ? (
            <span
              className={clsx(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                connectionState === "failed" || connectionState === "disconnected"
                  ? "bg-rose-400"
                  : "bg-amber-400",
              )}
            />
          ) : null}
        </div>
      </header>

      {statusNotice ? (
        <div
          className={clsx(
            "flex items-center justify-between gap-3 border-b px-3 py-2 text-xs sm:px-4",
            statusNotice.tone === "danger"
              ? "border-rose-400/14 bg-rose-500/10 text-rose-100"
              : "border-amber-400/14 bg-amber-500/10 text-amber-100",
          )}
        >
          <span>{statusNotice.message}</span>
          {connectionState !== "connected" ? (
            <button
              type="button"
              className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-medium transition hover:bg-white/8"
              onClick={onReconnect}
            >
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.05),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(2,6,23,0.02))]">
        <MessageList
          messages={messages}
          currentUserId={currentUser.userID}
          isLoading={isLoadingMessages}
          typingParticipants={chat.typingParticipants}
          showAuthors={!isDirectChat}
          onRetry={onRetry}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      <MessageInput
        onSend={onSend}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </section>
  );
}
