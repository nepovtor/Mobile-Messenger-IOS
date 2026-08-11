import { LoaderCircle, Mic, SendHorizonal, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toastStore } from "@/shared/model/toastStore";

const MAX_RECORDING_SECONDS = 120;
const VOICE_MIME_TYPE_CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

function selectVoiceRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  return (
    VOICE_MIME_TYPE_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? null
  );
}

function formatRecordingDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function voiceErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Разрешите доступ к микрофону в настройках браузера.";
    }
    if (error.name === "NotFoundError") {
      return "Микрофон не найден.";
    }
  }
  return error instanceof Error
    ? error.message
    : "Не удалось записать голосовое сообщение.";
}

export function MessageInput({
  onSend,
  onSendVoice,
  onTypingStart,
  onTypingStop,
}: {
  onSend: (text: string) => Promise<void>;
  onSendVoice: (recording: Blob) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [isSending, setSending] = useState(false);
  const [isRecording, setRecording] = useState(false);
  const [isUploadingVoice, setUploadingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const typingTimeoutRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingCancelledRef = useRef(false);

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
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
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
    if (!text || isSending || isRecording || isUploadingVoice) {
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

  const finishRecorder = (cancelled: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recordingCancelledRef.current = cancelled;
    recorder.stop();
  };

  const startRecording = async () => {
    if (isSending || isRecording || isUploadingVoice) {
      return;
    }

    try {
      const mimeType = selectVoiceRecorderMimeType();
      if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Запись голоса не поддерживается здесь. Откройте приложение в Safari или Chrome.",
        );
      }

      clearTyping();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64_000,
      });

      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingCancelledRef.current = false;
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        finishRecorder(true);
        toastStore.getState().showToast({
          tone: "danger",
          title: "Голосовое сообщение",
          message: "Запись была прервана. Попробуйте ещё раз.",
        });
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);

        if (recordingCancelledRef.current) {
          recordingChunksRef.current = [];
          setRecordingSeconds(0);
          return;
        }

        const normalizedMimeType = mimeType.startsWith("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";
        const recording = new Blob(recordingChunksRef.current, {
          type: normalizedMimeType,
        });
        recordingChunksRef.current = [];
        setUploadingVoice(true);
        void onSendVoice(recording)
          .catch((error: unknown) => {
            toastStore.getState().showToast({
              tone: "danger",
              title: "Голосовое сообщение",
              message: voiceErrorMessage(error),
            });
          })
          .finally(() => {
            setUploadingVoice(false);
            setRecordingSeconds(0);
          });
      };

      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => {
          const next = Math.min(current + 1, MAX_RECORDING_SECONDS);
          if (next >= MAX_RECORDING_SECONDS && recorder.state === "recording") {
            recorder.stop();
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      toastStore.getState().showToast({
        tone: "danger",
        title: "Голосовое сообщение",
        message: voiceErrorMessage(error),
      });
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
      <div className="flex min-h-[60px] items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.045] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-cyan-200/35">
        {isRecording ? (
          <div className="flex min-h-11 flex-1 items-center gap-3 px-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-400" />
            <span className="font-mono text-sm text-rose-100">
              {formatRecordingDuration(recordingSeconds)}
            </span>
            <span className="text-xs text-slate-400">Идёт запись</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            aria-label="Сообщение"
            value={value}
            placeholder="Напишите сообщение…"
            disabled={isUploadingVoice}
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
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2 text-[16px] leading-6 text-white outline-none placeholder:text-slate-500 disabled:opacity-60 sm:text-sm"
          />
        )}

        {isRecording ? (
          <>
            <button
              type="button"
              aria-label="Отменить запись"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/8 hover:text-white active:scale-95"
              onClick={() => finishRecorder(true)}
            >
              <X className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Отправить голосовое сообщение"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-400 text-white shadow-[0_10px_22px_rgba(251,113,133,0.2)] transition hover:brightness-110 active:scale-95"
              onClick={() => finishRecorder(false)}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          </>
        ) : (
          <>
            {!value.trim() ? (
              <button
                type="button"
                aria-label="Записать голосовое сообщение"
                disabled={isSending || isUploadingVoice}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/7 text-cyan-100 transition hover:bg-white/12 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void startRecording()}
              >
                {isUploadingVoice ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
            ) : null}
            <button
              type="submit"
              aria-label="Отправить"
              disabled={!value.trim() || isSending || isUploadingVoice}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-[0_10px_22px_rgba(34,211,238,0.2)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </form>
  );
}
