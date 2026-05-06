import clsx from "clsx";
import { Users } from "lucide-react";
import type { ChatSummary } from "../../types/chat";
import { formatChatTimestamp } from "../../utils/date";
import { Avatar } from "../ui/Avatar";

export function ChatListItem({
  chat,
  isActive,
  onClick,
}: {
  chat: ChatSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "w-full rounded-[28px] border p-4 text-left transition duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
        isActive
          ? "border-cyan-300/28 bg-cyan-400/10 shadow-[0_20px_44px_rgba(34,211,238,0.14)]"
          : "border-white/8 bg-white/[0.04] hover:-translate-y-0.5 hover:border-white/12 hover:bg-white/[0.08]",
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <Avatar name={chat.title} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {chat.title}
              </p>
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Users className="h-3.5 w-3.5" />
                {chat.participantCount} participants
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="app-mono text-[11px] text-slate-500">
                {formatChatTimestamp(chat.lastActivity)}
              </span>
              {chat.unreadCount > 0 ? (
                <span className="rounded-full bg-[linear-gradient(135deg,#fbbf24,#67e8f9)] px-2 py-0.5 text-[11px] font-semibold text-slate-950">
                  {chat.unreadCount}
                </span>
              ) : null}
            </div>
          </div>
          <p
            className={clsx(
              "mt-3 truncate text-sm",
              chat.typingParticipants.length > 0
                ? "text-cyan-100"
                : "text-slate-400",
            )}
          >
            {chat.typingParticipants.length > 0
              ? `${chat.typingParticipants.join(", ")} typing…`
              : chat.lastMessagePreview || "Новых сообщений пока нет"}
          </p>
        </div>
      </div>
    </button>
  );
}
