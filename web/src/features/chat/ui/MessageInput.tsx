import { SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
}: {
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
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
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
    <form
      className="messenger-input border-t border-white/8 bg-slate-950/65 px-3 pt-3 backdrop-blur-xl sm:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.045] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-cyan-200/35">
        <textarea
          ref={textareaRef}
          rows={1}
          aria-label="Сообщение"
          value={value}
          placeholder="Напишите сообщение…"
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
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2 text-[16px] leading-6 text-white outline-none placeholder:text-slate-500 sm:text-sm"
        />
        <button
          type="submit"
          aria-label="Отправить"
          disabled={!value.trim() || isSending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-[0_10px_22px_rgba(34,211,238,0.2)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendHorizonal className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
