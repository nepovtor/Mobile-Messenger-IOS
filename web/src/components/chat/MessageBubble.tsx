import clsx from "clsx";
import { useState } from "react";
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
  onEditMessage,
  onDeleteMessage,
}: {
  message: Message;
  isOwn: boolean;
  showAuthor: boolean;
  onRetry?: () => void;
  onEditMessage?: (text: string) => Promise<void>;
  onDeleteMessage?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(message.text ?? "");
  const [isEditing, setEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSave() {
    if (!onEditMessage) {
      return;
    }
    setSaving(true);
    try {
      await onEditMessage(draft);
      setActionError(null);
      setEditing(false);
    } catch {
      setActionError("Could not update message.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDeleteMessage) {
      return;
    }
    setDeleting(true);
    try {
      await onDeleteMessage();
      setActionError(null);
    } catch {
      setActionError("Could not delete message.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[82%] rounded-[24px] px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.25)]",
          isOwn
            ? "bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950"
            : "border border-white/10 bg-white/8 text-white",
          message.status === "failed" &&
            "border border-rose-400/30 bg-rose-500/15 text-rose-50",
          message.status === "sending" && "opacity-75",
        )}
      >
        {showAuthor && !isOwn ? (
          <p className="mb-1 text-xs font-medium text-cyan-200">
            {message.authorName}
          </p>
        ) : null}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                onClick={() => {
                  setDraft(message.text ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="px-3 py-1.5 text-xs"
                disabled={isSaving || draft.trim().length === 0}
                onClick={() => void handleSave()}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={clsx(
              "whitespace-pre-wrap break-words text-sm",
              message.deletedAt && "italic opacity-80",
            )}
          >
            {message.text}
          </p>
        )}
        <div
          className={clsx(
            "mt-2 flex items-center gap-2 text-[11px]",
            isOwn ? "text-slate-900/70" : "text-slate-400",
          )}
        >
          <span>{formatMessageTimestamp(message.createdAt)}</span>
          {message.editedAt ? <span>Edited</span> : null}
          <span>{statusLabel(message)}</span>
          {message.status === "failed" && onRetry ? (
            <Button
              variant="ghost"
              className="px-2 py-1 text-[11px]"
              onClick={onRetry}
            >
              Retry
            </Button>
          ) : null}
          {isOwn && !isEditing && !message.deletedAt ? (
            <>
              {onEditMessage ? (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-[11px]"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              ) : null}
              {onDeleteMessage ? (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-[11px]"
                  disabled={isDeleting}
                  onClick={() => void handleDelete()}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        {actionError ? (
          <p
            className={clsx(
              "mt-2 text-[11px]",
              isOwn ? "text-slate-900/80" : "text-rose-200",
            )}
          >
            {actionError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
