import clsx from "clsx";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock3,
  Ellipsis,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toastStore } from "@/shared/model/toastStore";
import type { Message, MessageStatus } from "@/features/chat/types/message";
import { formatMessageTimestamp } from "@/utils/date";
import { Button } from "@/components/ui/Button";

const messageStatusMeta = {
  sending: {
    icon: Clock3,
    label: "Отправляется",
  },
  sent: {
    icon: Check,
    label: "Отправлено",
  },
  delivered: {
    icon: CheckCheck,
    label: "Доставлено",
  },
  read: {
    icon: CheckCheck,
    label: "Прочитано",
  },
  failed: {
    icon: AlertCircle,
    label: "Не отправлено",
  },
} as const;

function getMessageStatusMeta(status: MessageStatus) {
  return messageStatusMeta[status];
}

function getMessageText(message: Message) {
  if (message.deletedAt) {
    return message.text || "Сообщение удалено";
  }

  if (message.text) {
    return message.text;
  }

  return message.kind === "image" ? "Изображение" : "Сообщение";
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
  const [isMenuOpen, setMenuOpen] = useState(false);
  const statusMeta = getMessageStatusMeta(message.status);
  const StatusIcon = statusMeta.icon;
  const canManage = Boolean(
    isOwn &&
    !isEditing &&
    !message.deletedAt &&
    (onEditMessage || onDeleteMessage),
  );

  async function handleSave() {
    if (!onEditMessage) {
      return;
    }

    setSaving(true);
    try {
      await onEditMessage(draft.trim());
      setEditing(false);
    } catch (error) {
      toastStore.getState().showToast({
        tone: "danger",
        title: "Сообщение",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось изменить сообщение.",
      });
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
      setMenuOpen(false);
    } catch (error) {
      toastStore.getState().showToast({
        tone: "danger",
        title: "Сообщение",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось удалить сообщение.",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className={clsx("group flex", isOwn ? "justify-end" : "justify-start")}
    >
      <div className="relative max-w-[84%] sm:max-w-[78%]">
        {showAuthor && !isOwn ? (
          <p className="mb-1 px-1 text-xs font-medium text-cyan-200">
            {message.authorName}
          </p>
        ) : null}

        {canManage ? (
          <button
            type="button"
            aria-label="Действия"
            className={clsx(
              "absolute top-2 z-10 rounded-full border border-white/10 bg-slate-950/92 p-1.5 text-slate-300 shadow-[0_12px_30px_rgba(3,8,20,0.28)] transition hover:bg-slate-900 hover:text-white",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
              isOwn ? "-left-10" : "-right-10",
            )}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        ) : null}

        <div
          className={clsx(
            "rounded-[22px] px-3.5 py-2.5 shadow-[0_16px_38px_rgba(5,12,24,0.18)]",
            isOwn
              ? "rounded-br-md bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] text-white"
              : "rounded-bl-md border border-white/8 bg-white/[0.06] text-white",
            message.status === "failed" &&
              "border border-rose-400/20 bg-rose-500/14 text-rose-50",
            message.status === "sending" && "opacity-90",
          )}
        >
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                className="min-h-[88px] w-full rounded-[18px] border border-white/12 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60"
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
                  }}
                >
                  Отмена
                </Button>
                <Button
                  size="sm"
                  disabled={isSaving || draft.trim().length === 0}
                  onClick={() => void handleSave()}
                >
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p
                className={clsx(
                  "whitespace-pre-wrap break-words text-sm leading-6",
                  message.deletedAt && "italic opacity-80",
                )}
              >
                {getMessageText(message)}
              </p>

              <div
                className={clsx(
                  "mt-2 flex items-center gap-1.5 text-[11px]",
                  isOwn
                    ? "justify-end text-white/78"
                    : "justify-end text-slate-400",
                  message.status === "failed" && "text-rose-100",
                )}
              >
                {message.editedAt ? <span>изм.</span> : null}
                <span>{formatMessageTimestamp(message.createdAt)}</span>
                {isOwn ? (
                  <span
                    aria-label={statusMeta.label}
                    className="inline-flex items-center"
                  >
                    <StatusIcon className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>

        {message.status === "failed" && onRetry ? (
          <div
            className={clsx(
              "mt-1.5 flex",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-rose-200 transition hover:bg-rose-500/10 hover:text-rose-100"
              onClick={onRetry}
            >
              <RotateCcw className="h-3 w-3" />
              Повторить
            </button>
          </div>
        ) : null}

        {message.status === "failed" && message.error ? (
          <p className="mt-1 px-1 text-[11px] text-rose-200">{message.error}</p>
        ) : null}

        {isMenuOpen ? (
          <div
            className={clsx(
              "absolute top-full z-20 mt-2 min-w-[156px] rounded-[16px] border border-white/10 bg-[#0b1420]/96 p-1.5 shadow-[0_22px_60px_rgba(3,8,20,0.46)] backdrop-blur-2xl",
              isOwn ? "right-0" : "left-0",
            )}
          >
            {onEditMessage ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/[0.06]"
                onClick={() => {
                  setEditing(true);
                  setMenuOpen(false);
                }}
              >
                <Pencil className="h-4 w-4" />
                Изменить
              </button>
            ) : null}
            {onDeleteMessage ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm text-rose-100 transition hover:bg-rose-500/12"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? "Удаление..." : "Удалить"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
