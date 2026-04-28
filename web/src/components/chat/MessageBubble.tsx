import clsx from "clsx";
import type { Message } from "../../types/message";
import { formatMessageTimestamp } from "../../utils/date";
import { Button } from "../ui/Button";

function statusLabel(message: Message): string {
  if (message.status === "failed") {
    return "Failed";
  }
  if (message.status === "sending") {
    return "Sending";
  }
  if (message.status === "read") {
    return "Read";
  }
  if (message.status === "delivered") {
    return "Sent";
  }
  return "Sent";
}

export function MessageBubble({
  message,
  isOwn,
  showAuthor,
  onRetry,
}: {
  message: Message;
  isOwn: boolean;
  showAuthor: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[82%] rounded-[24px] px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.25)]",
          isOwn
            ? "bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950"
            : "border border-white/10 bg-white/8 text-white",
          message.status === "failed" && "border border-rose-400/30 bg-rose-500/15 text-rose-50",
          message.status === "sending" && "opacity-75",
        )}
      >
        {showAuthor && !isOwn ? (
          <p className="mb-1 text-xs font-medium text-cyan-200">{message.authorName}</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
        <div
          className={clsx(
            "mt-2 flex items-center gap-2 text-[11px]",
            isOwn ? "text-slate-900/70" : "text-slate-400",
          )}
        >
          <span>{formatMessageTimestamp(message.createdAt)}</span>
          <span>{statusLabel(message)}</span>
          {message.status === "failed" && onRetry ? (
            <Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
