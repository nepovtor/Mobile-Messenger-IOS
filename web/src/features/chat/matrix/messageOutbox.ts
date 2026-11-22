import { validAttachment, type PendingAttachment } from "./encryptedAttachment";
export type PendingSecureMessage = {
  transactionID: string;
  chatID: string;
  body: string;
  createdAt: number;
  attachment?: PendingAttachment;
};

export function assertPendingMessages(
  value: unknown,
): asserts value is PendingSecureMessage[] {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some(
      (entry) =>
        !entry ||
        typeof entry.transactionID !== "string" ||
        !entry.transactionID ||
        entry.transactionID.length > 128 ||
        typeof entry.chatID !== "string" ||
        !entry.chatID ||
        entry.chatID.length > 128 ||
        typeof entry.body !== "string" ||
        !entry.body.trim() ||
        entry.body.length > 4000 ||
        typeof entry.createdAt !== "number" ||
        !Number.isFinite(entry.createdAt) ||
        (entry.attachment !== undefined &&
          !validAttachment(entry.attachment, true)),
    ) ||
    value.reduce((size, entry) => size + (entry.attachment?.size ?? 0), 0) >
      20 * 1024 * 1024 ||
    new Set(value.map((entry) => entry.transactionID)).size !== value.length
  ) {
    throw new Error("Локальная очередь сообщений повреждена");
  }
}

/** The caller persists snapshots inside the encrypted session vault, before delivery. */
export class SecureMessageOutbox {
  private active = true;
  private entries: PendingSecureMessage[];
  private mutation: Promise<void> = Promise.resolve();
  private delivery?: Promise<void>;
  private listeners = new Set<() => void>();
  private failure?: string;

  constructor(
    initial: PendingSecureMessage[],
    private readonly persist: (
      snapshot: PendingSecureMessage[],
    ) => Promise<void>,
    private readonly deliver: (
      message: PendingSecureMessage,
    ) => Promise<unknown>,
  ) {
    assertPendingMessages(initial);
    this.entries = structuredClone(initial);
  }

  snapshot(): PendingSecureMessage[] {
    return structuredClone(this.entries);
  }
  get error(): string | undefined {
    return this.failure;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
  private requireActive(): void {
    if (!this.active) throw new Error("Сессия закрыта");
  }
  private change(next: () => PendingSecureMessage[]): Promise<void> {
    const operation = this.mutation.then(async () => {
      this.requireActive();
      const entries = next();
      assertPendingMessages(entries);
      await this.persist(structuredClone(entries));
      this.requireActive();
      this.entries = entries;
      this.emit();
    });
    this.mutation = operation.catch(() => undefined);
    return operation;
  }

  async enqueue(
    chatID: string,
    body: string,
    attachment?: PendingAttachment,
  ): Promise<string> {
    const transactionID = crypto.randomUUID();
    await this.change(() => [
      ...this.entries,
      {
        transactionID,
        chatID,
        body,
        createdAt: Date.now(),
        ...(attachment ? { attachment: structuredClone(attachment) } : {}),
      },
    ]);
    void this.retry();
    return transactionID;
  }

  retry(): Promise<void> {
    if (this.delivery) return this.delivery;
    if (!this.active) return Promise.resolve();
    this.delivery = (async () => {
      try {
        await this.mutation;
        this.failure = undefined;
        while (this.active && this.entries.length) {
          const entry = { ...this.entries[0] };
          await this.deliver(entry);
          this.requireActive();
          await this.change(() =>
            this.entries.filter(
              (item) => item.transactionID !== entry.transactionID,
            ),
          );
        }
      } catch (error) {
        if (this.active)
          this.failure =
            error instanceof Error
              ? error.message
              : "Не удалось отправить сообщение";
      } finally {
        this.delivery = undefined;
        if (this.active) this.emit();
      }
    })();
    return this.delivery;
  }

  close(): void {
    this.active = false;
    this.entries = [];
    this.listeners.clear();
  }
}
