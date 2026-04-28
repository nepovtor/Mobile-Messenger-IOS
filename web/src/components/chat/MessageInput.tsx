import { useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import type { ConnectionState } from "../../realtime/realtimeTypes";
import { ConnectionBadge } from "./ConnectionBadge";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";

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
  const typingTimeoutRef = useRef<number | null>(null);

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

  return (
    <div className="border-t border-white/8 bg-slate-950/45 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Enter to send, Shift+Enter for a new line
        </p>
        <ConnectionBadge state={connectionState} />
      </div>
      <div className="flex items-end gap-3">
        <Textarea
          rows={1}
          value={value}
          placeholder="Write a message…"
          onChange={(event) => {
            setValue(event.target.value);
            onTypingStart();
            queueTypingStop();
          }}
          onKeyDown={async (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const text = value.trim();
              if (!text) {
                return;
              }
              setValue("");
              onTypingStop();
              await onSend(text);
            }
          }}
          className="max-h-32 min-h-[52px]"
        />
        <Button
          className="h-[52px] px-4"
          disabled={!value.trim()}
          onClick={async () => {
            const text = value.trim();
            if (!text) {
              return;
            }
            setValue("");
            onTypingStop();
            await onSend(text);
          }}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
