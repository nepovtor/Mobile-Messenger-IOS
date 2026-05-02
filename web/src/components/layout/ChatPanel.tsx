import { ArrowLeft, Users } from "lucide-react";
import type { ChatSummary } from "../../types/chat";
import type { Message } from "../../types/message";
import type { CurrentUser } from "../../types/auth";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { formatRelativeStatus } from "../../utils/date";
import { MessageInput } from "../chat/MessageInput";
import { MessageList } from "../chat/MessageList";

export function ChatPanel({
  chat,
  messages,
  currentUser,
  connectionState,
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
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  onRetry: (clientMessageId: string) => void;
  onEditMessage: (messageId: string, text: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/6 backdrop-blur-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="rounded-full border border-white/10 bg-white/8 p-2 text-slate-300 md:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-white">
              {chat.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {chat.participantCount} participants
              </span>
              <span>Updated {formatRelativeStatus(chat.lastActivity)}</span>
              {chat.typingParticipants.length > 0 ? (
                <span className="text-cyan-200">
                  {chat.typingParticipants.join(", ")} typing…
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.32),rgba(2,6,23,0.16))]">
        <MessageList
          messages={messages}
          currentUserId={currentUser.userID}
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
