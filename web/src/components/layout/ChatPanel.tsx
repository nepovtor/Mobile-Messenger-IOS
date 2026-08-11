import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { ConnectionState } from "@/features/chat/realtime/realtimeTypes";
import type { CurrentUser } from "@/features/auth/types/auth";
import type { ChatSummary } from "@/features/chat/types/chat";
import type { Message } from "@/features/chat/types/message";
import { MessageInput } from "@/features/chat/ui/MessageInput";
import { MessageList } from "@/features/chat/ui/MessageList";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

export function ChatPanel({
  chat,
  messages,
  currentUser,
  connectionState,
  connectionIndicator,
  isLoadingMessages,
  onBack,
  onReconnect,
  onSend,
  onSendVoice,
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
  connectionIndicator: ReactNode;
  isLoadingMessages: boolean;
  onBack: () => void;
  onReconnect: () => void;
  onSend: (text: string) => Promise<void>;
  onSendVoice: (recording: Blob) => Promise<void>;
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
    <section className="messenger-chat flex h-full min-h-0 flex-col">
      <header className="border-b border-white/8 bg-slate-950/35 px-3 py-3 backdrop-blur-xl sm:px-5">
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
              className="h-11 w-11 rounded-[16px] text-[11px] sm:h-12 sm:w-12"
            />
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-white sm:text-base">
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

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">{connectionIndicator}</div>
            {connectionState !== "connected" ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full px-3 text-xs"
                onClick={onReconnect}
              >
                Повторить
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
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
        onSendVoice={onSendVoice}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </section>
  );
}
