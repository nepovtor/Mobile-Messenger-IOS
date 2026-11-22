import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { MatrixSession } from "./matrixSession";
import type { VerificationSnapshot } from "./matrixVerification";

export function MatrixVerificationPanel({
  session,
  chatID,
  onError,
}: {
  session: MatrixSession;
  chatID: string | null;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<VerificationSnapshot>({ phase: "idle" });
  const [busy, setBusy] = useState(false);
  const controller = session.verification;
  useEffect(() => {
    if (!controller) return;
    const changed = () => setState(controller.snapshot());
    changed();
    return controller.subscribe(changed);
  }, [controller]);
  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch {
      onError(
        "Не удалось выполнить проверку устройства. Повторите попытку на обоих устройствах",
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestPeer() {
    if (!chatID || !session.transport || !controller) return;
    const room = await session.transport.open(chatID);
    const others = room
      .getMembers()
      .filter(
        (member) =>
          member.membership === "join" &&
          member.userId !== session.client?.getUserId(),
      );
    if (others.length !== 1)
      throw new Error("Откройте личный диалог для проверки собеседника");
    await controller.requestUser(others[0].userId, room.roomId);
  }
  if (!controller) return null;
  const pending = ["requested", "waiting", "comparing"].includes(state.phase);
  return (
    <section
      aria-label="Проверка устройств"
      className="space-y-3 border-t border-white/10 pt-4 text-sm"
    >
      <h2 className="font-medium">Проверка устройств</h2>
      {!pending && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void perform(() => controller.requestOwnDevice())}
          >
            Подтвердить это устройство
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !chatID}
            onClick={() => void perform(requestPeer)}
          >
            Проверить собеседника
          </Button>
        </div>
      )}
      {state.peer && (
        <p className="break-all text-xs text-[#a1a1a6]">
          {state.peer}
          {state.device ? ` · ${state.device}` : ""}
        </p>
      )}
      {state.phase === "requested" &&
        (state.incoming ? (
          <Button
            size="sm"
            disabled={busy || !state.flowID}
            onClick={() => void perform(() => controller.accept(state.flowID!))}
          >
            Принять запрос проверки
          </Button>
        ) : (
          <p>Дождитесь ответа на другом устройстве</p>
        ))}
      {state.phase === "waiting" && (
        <p>Дождитесь завершения проверки на другом устройстве</p>
      )}
      {state.phase === "comparing" && (
        <>
          <p>
            Сравните коды на двух устройствах лично или по доверенному звонку.
            Подтверждайте только при полном совпадении.
          </p>
          {state.emoji && (
            <ol
              className="flex flex-wrap gap-3"
              aria-label="Семь символов проверки"
            >
              {state.emoji.map(([symbol, name], index) => (
                <li
                  key={index}
                  className="text-2xl"
                  aria-label={name}
                  title={name}
                >
                  {symbol}
                </li>
              ))}
            </ol>
          )}
          {state.decimal && (
            <p
              className="font-mono text-lg tabular-nums"
              aria-label="Числовой код проверки"
            >
              {state.decimal.join(" · ")}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !state.flowID}
              onClick={() =>
                void perform(() => controller.confirm(state.flowID!))
              }
            >
              Коды совпадают
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !state.flowID}
              onClick={() => controller.mismatch(state.flowID!)}
            >
              Не совпадают
            </Button>
          </div>
        </>
      )}
      {state.phase === "done" && <p role="status">Проверка завершена</p>}
      {state.phase === "cancelled" && <p role="status">Проверка отменена</p>}
      {state.phase === "error" && <p role="alert">{state.error}</p>}
      {pending && (
        <button
          className="text-xs text-[#a1a1a6]"
          onClick={() => void perform(() => controller.cancel())}
        >
          Отменить проверку
        </button>
      )}
    </section>
  );
}
