import { useEffect, useRef, useState } from "react";
import type { SecureMessage, MatrixRoomTransport } from "./matrixRoomTransport";

export function MatrixAttachmentView({
  message,
  chatID,
  transport,
}: {
  message: SecureMessage;
  chatID: string;
  transport: MatrixRoomTransport;
}) {
  const [url, setURL] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const resource = useRef<string | undefined>(undefined);
  useEffect(() => {
    const scope = generation;
    const object = resource;
    const current = ++scope.current;
    return () => {
      if (scope.current === current) scope.current++;
      if (object.current) URL.revokeObjectURL(object.current);
      object.current = undefined;
    };
  }, []);
  async function open() {
    if (busy || url) return;
    const current = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const blob = await transport.download(chatID, message.id);
      if (generation.current !== current) return;
      resource.current = URL.createObjectURL(blob);
      setURL(resource.current);
    } catch {
      if (generation.current === current)
        setError("Не удалось проверить и открыть вложение");
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  const attachment = message.attachment;
  if (!attachment) return null;
  return (
    <div className="mt-3 space-y-2">
      {!url && (
        <button
          className="text-sm underline"
          disabled={busy}
          onClick={() => void open()}
        >
          {busy ? "Проверяем вложение…" : "Открыть вложение"}
        </button>
      )}
      {url && attachment.kind === "image" && (
        <img
          src={url}
          alt={attachment.name}
          className="max-h-96 max-w-full rounded"
        />
      )}
      {url && attachment.kind === "audio" && (
        <audio controls src={url} preload="metadata" />
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
