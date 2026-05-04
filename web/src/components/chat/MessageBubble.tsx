import clsx from "clsx";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock3,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { Message, MessageStatus } from "../../types/message";
import { formatMessageTimestamp } from "../../utils/date";
import { Button } from "../ui/Button";

const messageStatusMeta = {
  sending: {
    label: "Sending",
    icon: Clock3,
  },
  sent: {
    label: "Sent",
    icon: Check,
  },
  delivered: {
    label: "Delivered",
    icon: CheckCheck,
  },
  read: {
    label: "Read",
    icon: CheckCheck,
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
  },
} as const;

function getMessageStatusMeta(status: MessageStatus) {
  return messageStatusMeta[status];
}

function getMessageText(message: Message) {
  if (message.deletedAt) {
    return message.text || "Message deleted";
  }

  if (message.text) {
    return message.text;
  }

  return message.kind === "image" ? "Image attachment" : "Message";
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
  const statusMeta = getMessageStatusMeta(message.status);
  const StatusIcon = statusMeta.icon;

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
      <div className={clsx("max-w-[88%] space-y-2", isOwn && "items-end")}>
        {showAuthor && !isOwn ? (
          <p className="px-1 text-xs font-medium text-cyan-200">
            {message.authorName}
          </p>
        ) : null}

        <div
          className={clsx(
            "rounded-[26px] border px-4 py-3 shadow-[0_18px_42px_rgba(15,23,42,0.22)]",
            isOwn
              ? "border-cyan-300/12 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-500 text-white"
              : "border-white/10 bg-white/[0.07] text-white backdrop-blur-xl",
            message.status === "failed" &&
              "border-rose-400/25 bg-rose-500/18 text-rose-50",
            message.status === "sending" && "opacity-85",
          )}
        >
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                className="min-h-[88px] w-full rounded-2xl border border-white/12 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={4000}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(message.text ?? "");
                    setEditing(false);
                    setActionError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
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
                "whitespace-pre-wrap break-words text-sm leading-6",
                message.deletedAt && "italic opacity-80",
              )}
            >
              {getMessageText(message)}
            </p>
          )}
        </div>

        <div
          className={clsx(
            "flex flex-wrap items-center gap-2 px-1 text-[11px]",
            isOwn ? "justify-end text-slate-300" : "text-slate-400",
          )}
        >
          <span>{formatMessageTimestamp(message.createdAt)}</span>
          {message.editedAt ? <span>Edited</span> : null}
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1",
              message.status === "failed"
                ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
                : "border-white/10 bg-white/[0.05]",
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {statusMeta.label}
          </span>
          {message.status === "failed" && onRetry ? (
            <Button variant="ghost" size="sm" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          ) : null}
          {isOwn && !isEditing && !message.deletedAt ? (
            <>
              {onEditMessage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : null}
              {onDeleteMessage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>

        {message.status === "failed" && message.error ? (
          <p className="px-1 text-[11px] text-rose-200">{message.error}</p>
        ) : null}
        {actionError ? (
          <p className="px-1 text-[11px] text-rose-200">{actionError}</p>
        ) : null}
      </div>
    </div>
  );
}
