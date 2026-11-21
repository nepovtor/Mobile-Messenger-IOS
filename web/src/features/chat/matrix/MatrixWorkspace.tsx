import { prepareAttachment } from "./encryptedAttachment";
import { MatrixAttachmentView } from "./MatrixAttachmentView";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { chatApi } from "@/features/chat/api/chatApi";
import type { ChatSummary } from "@/features/chat/types/chat";
import type { CurrentUser } from "@/features/auth/types/auth";
import { logoutUserSession } from "@/app/sessionCoordinator";
import { MatrixVerificationPanel } from "./MatrixVerificationPanel";
import { MatrixSession, authorizeMatrix } from "./matrixSession";
import type { MatrixBackendConfig } from "./matrixApi";
import { useMatrixHistory } from "./useMatrixHistory";
import type { PendingSecureMessage } from "./messageOutbox";
import {
  UnlockedSessionVault,
  readSealedSession,
  retireSealedSessions,
  type SealedSession,
} from "./sessionVault";

export function MatrixWorkspace({
  config,
  user,
}: {
  config: MatrixBackendConfig;
  user: CurrentUser;
}) {
  const runtime = useRef<MatrixSession | null>(null);
  const generation = useRef(0);
  const loginAbort = useRef<AbortController | null>(null);
  const [stored, setStored] = useState<SealedSession | null | undefined>(
    undefined,
  );
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [revokedDevice, setRevokedDevice] = useState(false);
  const [connectedSession, setConnectedSession] =
    useState<MatrixSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const {
    messages,
    error: historyError,
    refresh: refreshHistory,
  } = useMatrixHistory(ready ? connectedSession : null, selected);
  const [pending, setPending] = useState<PendingSecureMessage[]>([]);
  const [deliveryError, setDeliveryError] = useState<string>();
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [phone, setPhone] = useState("");
  const [recovery, setRecovery] = useState("");
  const [generatedRecovery, setGeneratedRecovery] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const scope = generation;
    const current = ++scope.current;
    void readSealedSession(config.expectedUserID)
      .then((value) => {
        if (generation.current === current) setStored(value ?? null);
      })
      .catch(() => {
        if (generation.current === current)
          setError("Не удалось прочитать локальную сессию");
      });
    return () => {
      scope.current = current + 1;
      loginAbort.current?.abort();
      void runtime.current?.close();
      runtime.current = null;
    };
  }, [config.expectedUserID]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy || stored === undefined || (!stored && passphrase.length < 12))
      return;
    const current = generation.current;
    const secret = passphrase;
    setPassphrase("");
    setBusy(true);
    setError(null);
    const abort = new AbortController();
    loginAbort.current = abort;
    let next: MatrixSession | undefined;
    let unlockedVault: UnlockedSessionVault | undefined;
    try {
      const unlocked = stored
        ? await UnlockedSessionVault.unlock(
            secret,
            config.expectedUserID,
            stored,
          )
        : await (async () => {
            const authorization = authorizeMatrix(config, abort.signal);
            // Attach a rejection handler while the local key is being derived.
            void authorization.catch(() => undefined);
            const vault = await UnlockedSessionVault.create(
              secret,
              config.expectedUserID,
            );
            return { vault, session: await authorization };
          })();
      unlockedVault = unlocked.vault;
      if (generation.current !== current) {
        unlocked.vault.lock();
        return;
      }
      next = new MatrixSession(
        config,
        unlocked.session,
        unlocked.vault,
        (message, fatal) => {
          if (generation.current !== current) return;
          setError(message);
          if (fatal) {
            setRevokedDevice(runtime.current?.revoked === true);
            setReady(false);
            setGeneratedRecovery(null);
            setRecovery("");
          }
        },
      );
      runtime.current = next;
      await next.open();
      if (generation.current !== current) {
        await next.close();
        return;
      }
      const saved = await readSealedSession(config.expectedUserID);
      if (generation.current !== current) {
        await next.close();
        return;
      }
      if (!saved) throw new Error("Локальная сессия не сохранена");
      setStored(saved);
      setConnectedSession(next);
      setReady(true);
      const metadata = await chatApi.getChats();
      if (generation.current === current) setChats(metadata);
    } catch (failure) {
      await next?.close();
      unlockedVault?.lock();
      if (generation.current === current) {
        runtime.current = null;
        setConnectedSession(null);
        // A session may already have been persisted before metadata loading failed.
        // Preserve that device instead of silently creating and overwriting it.
        const saved = await readSealedSession(config.expectedUserID).catch(
          () => undefined,
        );
        if (generation.current !== current) return;
        if (saved) setStored(saved);
        setError(messageFor(failure));
        setReady(false);
      }
    } finally {
      abort.abort();
      if (generation.current === current) setBusy(false);
    }
  }

  useEffect(() => {
    const outbox = ready ? runtime.current?.outbox : undefined;
    if (!outbox) {
      setPending([]);
      setDeliveryError(undefined);
      return;
    }
    const changed = () => {
      setPending(outbox.snapshot());
      setDeliveryError(outbox.error);
    };
    changed();
    return outbox.subscribe(changed);
  }, [ready]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !text.trim() || sending || !runtime.current?.transport)
      return;
    setSending(true);
    setError(null);
    try {
      if (editing) {
        await runtime.current.transport.editText(selected, editing, text);
        setEditing(null);
      } else {
        if (!runtime.current.outbox)
          throw new Error("Очередь отправки недоступна");
        await runtime.current.outbox.enqueue(selected, text);
      }
      setText("");
      refreshHistory();
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    const current = generation.current;
    const chatID = selected;
    const session = runtime.current;
    if (!chatID || sending || !session?.outbox) return;
    setSending(true);
    setError(null);
    try {
      const attachment = await prepareAttachment(file);
      if (generation.current !== current || runtime.current !== session) return;
      await session.outbox.enqueue(chatID, attachment.name, attachment);
    } catch (failure) {
      if (generation.current === current) setError(messageFor(failure));
    } finally {
      if (generation.current === current) setSending(false);
    }
  }

  async function createChat(event: FormEvent) {
    event.preventDefault();
    if (!phone.trim()) return;
    const current = generation.current;
    try {
      const chat = await chatApi.createChat(phone.trim(), [phone.trim()]);
      const metadata = await chatApi.getChats();
      if (generation.current !== current) return;
      setChats(metadata);
      setSelected(chat.id);
      setPhone("");
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  async function closeSession() {
    const current = runtime.current;
    setReady(false);
    setGeneratedRecovery(null);
    setRecovery("");
    try {
      // The backend settles MAS/Matrix revocation before acknowledging logout.
      // Keep the sealed local history/unsent queue; closing only locks its keys.
      await current?.close();
      await logoutUserSession();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  if (!ready)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <div>
          <p className="text-sm text-slate-400">Mobile Messenger</p>
          <h1 className="mt-2 text-2xl font-medium">Защищённая переписка</h1>
        </div>
        <p className="text-sm leading-6 text-slate-300">
          {stored
            ? "Введите пароль локального хранилища, чтобы открыть ключи этого устройства"
            : "Задайте пароль для ключей на этом устройстве. Затем подтвердите вход своим номером телефона"}
        </p>
        {revokedDevice && (
          <div className="space-y-3">
            <p className="text-sm">
              Прежняя очередь останется зашифрованной на этом устройстве и не
              будет отправлена повторно.
            </p>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void retireSealedSessions(user.userID)
                  .then(() => {
                    setStored(null);
                    setRevokedDevice(false);
                    setError(null);
                  })
                  .catch(() =>
                    setError("Не удалось закрыть локальную сессию устройства"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Подготовить вход на новом устройстве
            </Button>
          </div>
        )}
        <form onSubmit={(event) => void connect(event)} className="space-y-4">
          <label className="block text-sm">
            Пароль локального хранилища
            <Input
              className="mt-2"
              type="password"
              autoComplete={stored ? "current-password" : "new-password"}
              minLength={stored ? 1 : 12}
              maxLength={1024}
              required
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              disabled={busy || stored === undefined}
            />
          </label>
          <Button
            type="submit"
            block
            isLoading={busy}
            disabled={stored === undefined}
          >
            {stored ? "Открыть переписку" : "Подтвердить вход"}
          </Button>
        </form>
        <p className="text-xs leading-5 text-slate-400">
          Этот пароль защищает сессию в браузере. Для переноса истории на другое
          устройство нужен отдельный ключ восстановления
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-200">
            {error}
          </p>
        )}
      </main>
    );

  return (
    <main className="grid min-h-dvh bg-[#141415] text-[#ededed] md:h-dvh md:grid-cols-[280px_1fr]">
      <aside className="flex min-h-0 flex-col gap-4 border-b border-white/10 bg-[#19191b] p-4 md:border-b-0 md:border-r">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-medium">Сообщения</h1>
            <p className="mt-1 text-xs text-[#a1a1a6]">{user.displayName}</p>
          </div>
          <button
            className="text-sm text-[#a1a1a6]"
            onClick={() => void closeSession()}
          >
            Выйти
          </button>
        </header>
        <form
          className="flex gap-2"
          onSubmit={(event) => void createChat(event)}
        >
          <Input
            aria-label="Номер нового контакта"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Номер телефона"
          />
          <Button type="submit" size="sm" aria-label="Создать диалог">
            +
          </Button>
        </form>
        <nav aria-label="Диалоги" className="min-h-0 flex-1 overflow-y-auto">
          {chats.length ? (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  setSelected(chat.id);
                  setText("");
                  setEditing(null);
                }}
                disabled={sending}
                aria-current={selected === chat.id ? "page" : undefined}
                className={`mb-1 block w-full rounded-lg px-3 py-3 text-left text-sm ${selected === chat.id ? "bg-[#2b2b2e]" : "hover:bg-white/5"}`}
              >
                {chat.title}
              </button>
            ))
          ) : (
            <p className="py-4 text-sm text-[#a1a1a6]">
              Добавьте контакт, чтобы начать переписку
            </p>
          )}
        </nav>
        {connectedSession && (
          <MatrixVerificationPanel
            session={connectedSession}
            chatID={selected}
            onError={setError}
          />
        )}
        <details className="border-t border-white/10 pt-4 text-sm">
          <summary className="cursor-pointer">Ключи и восстановление</summary>
          <p className="my-3 text-xs leading-5 text-[#a1a1a6]">
            При первом входе настройте восстановление. На новом устройстве
            используйте сохранённый ключ
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void runtime.current
                ?.setupRecovery()
                .then(setGeneratedRecovery)
                .catch((failure) => setError(messageFor(failure)))
            }
          >
            Настроить восстановление
          </Button>
          {generatedRecovery && (
            <div className="my-3 space-y-3">
              <p className="text-xs">
                Сохраните ключ вне приложения. Он даёт доступ к истории
                сообщений
              </p>
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/20 p-3 font-mono text-xs">
                {generatedRecovery}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setGeneratedRecovery(null)}
              >
                Ключ сохранён
              </Button>
            </div>
          )}
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void runtime.current
                ?.recover(recovery)
                .then(() => {
                  setRecovery("");
                  void refreshHistory();
                })
                .catch((failure) => setError(messageFor(failure)));
            }}
          >
            <Input
              type="password"
              aria-label="Ключ восстановления"
              autoComplete="off"
              value={recovery}
              onChange={(event) => setRecovery(event.target.value)}
              placeholder="Ключ восстановления"
            />
            <Button variant="secondary" size="sm" type="submit">
              Восстановить ключи
            </Button>
          </form>
        </details>
      </aside>
      <section className="flex min-h-[60dvh] min-w-0 flex-col md:min-h-0">
        <header className="border-b border-white/10 px-6 py-4">
          <h2 className="font-medium">
            {chats.find((chat) => chat.id === selected)?.title ??
              "Выберите диалог"}
          </h2>
          <p className="mt-1 text-xs text-[#a1a1a6]">
            {selected
              ? "Сообщения расшифровываются на этом устройстве"
              : "Рабочие диалоги и контакты"}
          </p>
        </header>
        {(error || historyError || deliveryError) && (
          <div
            role="alert"
            className="border-b border-rose-400/20 bg-rose-400/5 px-6 py-3 text-sm text-rose-200"
          >
            {error || historyError || deliveryError}
          </div>
        )}
        <div
          role="log"
          aria-label="История сообщений"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6"
        >
          {selected && (
            <button
              className="mx-auto px-4 py-2 text-xs text-[#a1a1a6]"
              onClick={() => {
                void runtime.current?.transport
                  ?.paginate(selected)
                  .then(refreshHistory)
                  .catch((failure) => setError(messageFor(failure)));
              }}
            >
              Загрузить более ранние сообщения
            </button>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-[85%] rounded-xl px-4 py-3 ${message.own ? "ml-auto bg-[#26394f]" : "bg-[#232325]"}`}
            >
              <p className="mb-1 text-xs text-[#a1a1a6]">
                {message.own ? "Вы" : message.sender}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {message.body}
              </p>
              {message.attachment &&
                selected &&
                connectedSession?.transport && (
                  <MatrixAttachmentView
                    key={`${selected}/${message.id}/${message.attachment.file.hashes?.sha256}`}
                    message={message}
                    chatID={selected}
                    transport={connectedSession.transport}
                  />
                )}
              <time className="mt-1 block text-right text-xs tabular-nums text-[#a1a1a6]">
                {new Date(message.timestamp).toLocaleTimeString("ru", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {message.own &&
                !message.failedToDecrypt &&
                !message.attachment && (
                  <button
                    className="mr-3 mt-2 text-xs text-[#a1a1a6]"
                    disabled={sending}
                    onClick={() => {
                      setEditing(message.id);
                      setText(message.body);
                    }}
                  >
                    Изменить
                  </button>
                )}
              {message.own && !message.failedToDecrypt && (
                <button
                  className="mt-2 text-xs text-[#a1a1a6]"
                  onClick={() => {
                    if (selected)
                      void runtime.current?.transport
                        ?.redact(selected, message.id)
                        .then(refreshHistory)
                        .catch((failure) => setError(messageFor(failure)));
                  }}
                >
                  Удалить
                </button>
              )}
            </article>
          ))}
          {pending
            .filter((message) => message.chatID === selected)
            .map((message) => (
              <article
                key={message.transactionID}
                className="ml-auto max-w-[85%] rounded-xl bg-[#26394f] px-4 py-3"
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {message.body}
                </p>
                <p className="mt-1 text-xs text-[#a1a1a6]">
                  {deliveryError ? "Не отправлено" : "Ожидает отправки"}
                </p>
              </article>
            ))}
        </div>
        {deliveryError && pending.length > 0 && (
          <button
            className="px-6 py-3 text-left text-sm"
            onClick={() => void runtime.current?.outbox?.retry()}
          >
            Повторить отправку
          </button>
        )}
        {editing && (
          <div className="flex justify-between px-4 py-2 text-sm">
            <span>Редактирование сообщения</span>
            <button
              onClick={() => {
                setEditing(null);
                setText("");
              }}
            >
              Отменить
            </button>
          </div>
        )}
        {selected && (
          <form
            className="flex items-end gap-3 border-t border-white/10 p-4"
            onSubmit={(event) => void send(event)}
          >
            {!editing && (
              <label className="cursor-pointer text-sm">
                Вложение
                <input
                  type="file"
                  className="sr-only"
                  aria-label="Прикрепить изображение или аудио"
                  disabled={sending}
                  accept="image/jpeg,image/png,image/webp,audio/mp4,audio/mpeg,audio/ogg,audio/webm,audio/wav"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void sendFile(file);
                  }}
                />
              </label>
            )}
            <Textarea
              aria-label="Сообщение"
              maxLength={4000}
              rows={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Сообщение"
              disabled={sending}
            />
            <Button type="submit" isLoading={sending} disabled={!text.trim()}>
              {editing ? "Сохранить" : "Отправить"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}

function messageFor(failure: unknown): string {
  return failure instanceof Error
    ? failure.message
    : "Не удалось выполнить действие";
}
