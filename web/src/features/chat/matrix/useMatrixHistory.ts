import { useCallback, useEffect, useState } from "react";
import { ClientEvent, MatrixEventEvent, RoomEvent } from "matrix-js-sdk";
import type { MatrixSession } from "./matrixSession";
import type { SecureMessage } from "./matrixRoomTransport";

export function useMatrixHistory(
  session: MatrixSession | null,
  chatID: string | null,
) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    chatID: string;
    messages: SecureMessage[];
    error?: string;
  }>();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!chatID || !session?.client || !session.transport) return;
    const { client, transport } = session;
    let active = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const current = ++request;
      try {
        const messages = await transport.history(chatID);
        if (active && request === current) setResult({ chatID, messages });
      } catch (error) {
        if (active && request === current)
          setResult({
            chatID,
            messages: [],
            error:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить историю",
          });
      }
    };
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 150);
    };
    void load();
    client.on(RoomEvent.Timeline, changed);
    client.on(MatrixEventEvent.Decrypted, changed);
    client.on(ClientEvent.Sync, changed);
    return () => {
      active = false;
      clearTimeout(timer);
      client.removeListener(RoomEvent.Timeline, changed);
      client.removeListener(MatrixEventEvent.Decrypted, changed);
      client.removeListener(ClientEvent.Sync, changed);
    };
  }, [session, chatID, revision]);
  return {
    messages: result?.chatID === chatID && session ? result.messages : [],
    error: result?.chatID === chatID && session ? result.error : undefined,
    refresh,
  };
}
