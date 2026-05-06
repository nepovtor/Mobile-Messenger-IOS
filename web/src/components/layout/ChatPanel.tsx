import { ArrowLeft, Users } from "lucide-react";
import type { ChatSummary } from "../../types/chat";
import type { Message } from "../../types/message";
import type { CurrentUser } from "../../types/auth";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { formatRelativeStatus } from "../../utils/date";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { ConnectionBadge } from "../chat/ConnectionBadge";
import { MessageInput } from "../chat/MessageInput";
import { MessageList } from "../chat/MessageList";

export function ChatPanel({
  chat,
  messages,
  currentUser,
  connectionState,
  isLoadingMessages,
  onBack,
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
  isLoadingMessages: boolean;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  onRetry: (clientMessageId: string) => void;
  onEditMessage: (messageId: string, text: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
}) {
  return (
    <section className="app-shell flex h-full min-h-0 flex-col overflow-hidden rounded-[34px]">
      <header className="border-b border-white/8 bg-white/[0.03] px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
            <Avatar
              name={chat.title}
              size="lg"
              className="hidden sm:inline-flex"
            />
            <div className="min-w-0">
              <div className="app-kicker">Active thread</div>
              <h2 className="mt-3 truncate text-lg font-semibold text-white sm:text-2xl">
                {chat.title}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  <Users className="h-3.5 w-3.5" />
                  {chat.participantCount} participants
                </span>
                <span className="app-mono rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  Updated {formatRelativeStatus(chat.lastActivity)}
                </span>
                {chat.typingParticipants.length > 0 ? (
                  <span className="rounded-full border border-cyan-300/16 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">
                    {chat.typingParticipants.join(", ")} typing…
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            <ConnectionBadge state={connectionState} />
            <div className="hidden rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-right lg:block">
              <p className="app-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Me
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {currentUser.displayName}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.26),rgba(2,6,23,0.08))]">
        <MessageList
          messages={messages}
          currentUserId={currentUser.userID}
          isLoading={isLoadingMessages}
          typingParticipants={chat.typingParticipants}
          onRetry={onRetry}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      <MessageInput
        connectionState={connectionState}
        onSend={onSend}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </section>
  );
}
