import type { MatrixClient } from "matrix-js-sdk";
import {
  CryptoEvent,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api";

export type VerificationSnapshot = {
  phase:
    | "idle"
    | "requested"
    | "waiting"
    | "comparing"
    | "done"
    | "cancelled"
    | "error";
  peer?: string;
  flowID?: string;
  device?: string;
  incoming?: boolean;
  emoji?: [string, string][];
  decimal?: number[];
  error?: string;
};

/** SAS is generated and checked by the official SDK. Only a user action approves it. */
export class MatrixVerificationController {
  private active = true;
  private request?: VerificationRequest;
  private verifier?: Verifier;
  private sas?: ShowSasCallbacks;
  private starting = false;
  private removeRequestListener?: () => void;
  private removeVerifierListeners?: () => void;
  private listeners = new Set<() => void>();
  private state: VerificationSnapshot = { phase: "idle" };
  private receive = (request: VerificationRequest) => {
    if (!this.active) return;
    if (this.request?.pending && this.request !== request) {
      void request.cancel().catch(() => undefined);
      return;
    }
    this.adopt(request);
  };

  constructor(private readonly client: MatrixClient) {
    client.on(CryptoEvent.VerificationRequestReceived, this.receive);
  }
  snapshot(): VerificationSnapshot {
    return {
      ...this.state,
      emoji: this.state.emoji?.map(([symbol, name]) => [symbol, name]),
      decimal: this.state.decimal?.slice(),
    };
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(state: VerificationSnapshot): void {
    if (!this.active) return;
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private requireActive(): void {
    if (!this.active) throw new Error("Сессия закрыта");
  }
  private async begin(
    create: () => Promise<VerificationRequest>,
  ): Promise<void> {
    this.requireActive();
    if (this.request?.pending || this.starting)
      throw new Error("Дождитесь завершения текущей проверки");
    this.starting = true;
    try {
      const request = await create();
      if (!this.active) {
        await request.cancel().catch(() => undefined);
        return;
      }
      if (this.request?.pending && this.request !== request) {
        await request.cancel();
        throw new Error("Уже выполняется другая проверка");
      }
      this.adopt(request);
    } finally {
      this.starting = false;
      if (this.request) this.changed(this.request);
    }
  }
  async requestOwnDevice(): Promise<void> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Хранилище ключей закрыто");
    await this.begin(() => crypto.requestOwnUserVerification());
  }
  async requestUser(userID: string, roomID: string): Promise<void> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Хранилище ключей закрыто");
    await this.begin(() => crypto.requestVerificationDM(userID, roomID));
  }
  private adopt(request: VerificationRequest): void {
    this.removeRequestListener?.();
    this.removeVerifierListeners?.();
    this.request = request;
    this.verifier = undefined;
    this.sas = undefined;
    const changed = () => this.changed(request);
    request.on(VerificationRequestEvent.Change, changed);
    this.removeRequestListener = () =>
      request.removeListener(VerificationRequestEvent.Change, changed);
    this.changed(request);
  }
  private changed(request: VerificationRequest): void {
    if (!this.active || this.request !== request) return;
    const identity = {
      flowID: request.transactionId,
      peer: request.otherUserId,
      device: request.otherDeviceId,
      incoming: !request.initiatedByMe,
    };
    if (request.phase === VerificationPhase.Done) {
      this.sas = undefined;
      this.publish({ ...identity, phase: "done" });
      return;
    }
    if (request.phase === VerificationPhase.Cancelled) {
      this.sas = undefined;
      this.publish({ ...identity, phase: "cancelled" });
      return;
    }
    if (request.verifier && request.verifier !== this.verifier)
      this.attach(request, request.verifier);
    if (this.sas) return;
    this.publish({
      ...identity,
      phase:
        request.phase === VerificationPhase.Requested ? "requested" : "waiting",
    });
    if (
      request.phase === VerificationPhase.Ready &&
      request.initiatedByMe &&
      !this.verifier &&
      !this.starting
    ) {
      this.starting = true;
      void request
        .startVerification("m.sas.v1")
        .then((verifier) => {
          if (this.active && this.request === request)
            this.attach(request, verifier);
        })
        .catch(() => this.failure(request))
        .finally(() => {
          this.starting = false;
        });
    }
  }
  private attach(request: VerificationRequest, verifier: Verifier): void {
    if (this.verifier === verifier) return;
    this.removeVerifierListeners?.();
    this.verifier = verifier;
    const show = (sas: ShowSasCallbacks) => {
      if (
        !this.active ||
        this.request !== request ||
        this.verifier !== verifier
      )
        return;
      this.sas = sas;
      this.publish({
        phase: "comparing",
        flowID: request.transactionId,
        peer: request.otherUserId,
        device: request.otherDeviceId,
        incoming: !request.initiatedByMe,
        emoji: sas.sas.emoji,
        decimal: sas.sas.decimal,
      });
    };
    const cancelled = () => {
      if (this.request === request && this.verifier === verifier) {
        this.sas = undefined;
        this.publish({
          ...this.state,
          phase: "cancelled",
          emoji: undefined,
          decimal: undefined,
        });
      }
    };
    verifier.on(VerifierEvent.ShowSas, show);
    verifier.on(VerifierEvent.Cancel, cancelled);
    this.removeVerifierListeners = () => {
      verifier.removeListener(VerifierEvent.ShowSas, show);
      verifier.removeListener(VerifierEvent.Cancel, cancelled);
    };
    const current = verifier.getShowSasCallbacks();
    if (current) show(current);
    void verifier
      .verify()
      .then(() => {
        if (
          this.active &&
          this.request === request &&
          this.verifier === verifier
        ) {
          this.sas = undefined;
          this.publish({
            ...this.state,
            phase: "done",
            emoji: undefined,
            decimal: undefined,
          });
        }
      })
      .catch(() => {
        if (
          this.verifier === verifier &&
          request.phase !== VerificationPhase.Cancelled
        )
          this.failure(request);
      });
  }
  private failure(request: VerificationRequest): void {
    if (!this.active || this.request !== request) return;
    this.sas = undefined;
    this.publish({
      phase: "error",
      peer: request.otherUserId,
      error: "Проверка не завершена. Повторите её на обоих устройствах",
    });
  }
  async accept(flowID: string): Promise<void> {
    this.requireActive();
    const request = this.request;
    if (
      !request ||
      request.transactionId !== flowID ||
      request.initiatedByMe ||
      request.phase !== VerificationPhase.Requested
    )
      throw new Error("Запрос проверки уже изменился");
    await request.accept();
  }
  async confirm(flowID: string): Promise<void> {
    this.requireActive();
    if (
      !flowID ||
      this.state.flowID !== flowID ||
      !this.sas ||
      this.state.phase !== "comparing"
    )
      throw new Error("Сначала сравните коды на двух устройствах");
    const sas = this.sas;
    this.sas = undefined;
    await sas.confirm();
    if (this.active && this.snapshot().phase !== "done")
      this.publish({
        ...this.state,
        phase: "waiting",
        emoji: undefined,
        decimal: undefined,
      });
  }
  mismatch(flowID: string): void {
    this.requireActive();
    if (!flowID || this.state.flowID !== flowID)
      throw new Error("Запрос проверки уже изменился");
    const sas = this.sas;
    this.sas = undefined;
    sas?.mismatch();
    this.publish({
      ...this.state,
      phase: "cancelled",
      emoji: undefined,
      decimal: undefined,
    });
  }
  async cancel(): Promise<void> {
    this.requireActive();
    this.sas = undefined;
    await this.request?.cancel();
    this.publish({
      ...this.state,
      phase: "cancelled",
      emoji: undefined,
      decimal: undefined,
    });
  }
  close(): void {
    this.active = false;
    this.client.removeListener(
      CryptoEvent.VerificationRequestReceived,
      this.receive,
    );
    this.removeRequestListener?.();
    this.removeVerifierListeners?.();
    if (this.request?.pending)
      void this.request.cancel().catch(() => undefined);
    this.request = undefined;
    this.verifier = undefined;
    this.sas = undefined;
    this.listeners.clear();
    this.state = { phase: "idle" };
  }
}
