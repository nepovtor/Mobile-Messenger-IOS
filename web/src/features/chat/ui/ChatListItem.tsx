import clsx from "clsx";
import type { ChatSummary } from "@/features/chat/types/chat";
import { formatChatTimestamp } from "@/utils/date";
import { Avatar } from "@/components/ui/Avatar";

export function ChatListItem({
  chat,
  isActive,
  onClick,
}: {
  chat: ChatSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  const isDirectChat = chat.participantCount <= 2;
  const preview =
    chat.typingParticipants.length > 0
      ? `${chat.typingParticipants.join(", ")} печатает...`
      : chat.lastMessagePreview || "Нет сообщений";

  return (
    <button
      type="button"
      className={clsx(
        "w-full rounded-[18px] px-3 py-3 text-left transition duration-200 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
        isActive
          ? "bg-[linear-gradient(135deg,rgba(34,211,238,0.13),rgba(59,130,246,0.12))] ring-1 ring-cyan-200/10"
          : "hover:bg-white/[0.05] active:bg-white/[0.06]",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <Avatar
          name={chat.title}
          size="sm"
          className="h-12 w-12 rounded-[16px] text-[11px] shadow-none"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white">
                {chat.title}
              </p>
              <p
                className={clsx(
                  "mt-1 truncate text-[13px] leading-5",
                  chat.typingParticipants.length > 0
                    ? "text-cyan-200"
                    : "text-slate-400",
                )}
              >
                {preview}
              </p>
              {!isDirectChat && chat.typingParticipants.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  {chat.participantCount} участников
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className={clsx(
                  "text-[11px]",
                  chat.unreadCount > 0 ? "text-cyan-100" : "text-slate-500",
                )}
              >
                {formatChatTimestamp(chat.lastActivity)}
              </span>
              {chat.unreadCount > 0 ? (
                <span className="min-w-5 rounded-full bg-cyan-300 px-1.5 py-0.5 text-center text-[10px] font-semibold text-slate-950">
                  {chat.unreadCount}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
