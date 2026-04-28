import clsx from "clsx";
import type { ChatSummary } from "../../types/chat";
import { formatChatTimestamp } from "../../utils/date";

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
        "w-full rounded-2xl border p-4 text-left transition",
        isActive
          ? "border-cyan-300/30 bg-cyan-400/12 shadow-[0_12px_40px_rgba(34,211,238,0.12)]"
          : "border-white/8 bg-white/4 hover:border-white/12 hover:bg-white/8",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{chat.title}</p>
          <p className="mt-1 truncate text-xs text-slate-400">
            {chat.typingParticipants.length > 0
              ? `${chat.typingParticipants.join(", ")} typing…`
              : chat.lastMessagePreview || "No messages yet"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-[11px] text-slate-500">
            {formatChatTimestamp(chat.lastActivity)}
          </span>
          {chat.unreadCount > 0 ? (
            <span className="rounded-full bg-cyan-400 px-2 py-0.5 text-[11px] font-semibold text-slate-950">
              {chat.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
