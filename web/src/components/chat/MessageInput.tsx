import { SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";
import { ConnectionBadge } from "./ConnectionBadge";

export function MessageInput({
  connectionState,
  onSend,
  onTypingStart,
  onTypingStop,
}: {
  connectionState: ConnectionState;
  onSend: (text: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [isSending, setSending] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    },
    [],
  );

  const queueTypingStop = () => {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingStop();
    }, 1200);
  };

  const clearTyping = () => {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    onTypingStop();
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || isSending) {
      return;
    }

    setSending(true);
    setValue("");
    clearTyping();

    try {
      await onSend(text);
    } catch {
      void 0;
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-white/8 bg-slate-950/55 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Enter to send, Shift+Enter for a new line
        </p>
        <ConnectionBadge state={connectionState} />
      </div>

      <div className="flex items-end gap-3">
        <Textarea
          ref={textareaRef}
          rows={1}
          aria-label="Message input"
          value={value}
          placeholder="Write a message…"
          onBlur={clearTyping}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);

            if (nextValue.trim()) {
              onTypingStart();
              queueTypingStop();
            } else {
              clearTyping();
            }
          }}
          onKeyDown={async (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              await submit();
            }
          }}
          className="max-h-40 min-h-[52px]"
        />
        <Button
          className="h-[52px] px-4"
          disabled={!value.trim() || isSending}
          isLoading={isSending}
          onClick={() => void submit()}
        >
          {!isSending ? <SendHorizonal className="h-4 w-4" /> : null}
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  );
}
