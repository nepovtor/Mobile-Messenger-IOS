import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import {
  CryptoEvent,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api";
import { MatrixVerificationController } from "./matrixVerification";

function fixture() {
  const emitter = new EventEmitter();
  let complete!: () => void;
  const verified = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const confirm = vi.fn(async () => {});
  const mismatch = vi.fn();
  const sas = {
    sas: { decimal: [1234, 5678, 4321] as [number, number, number] },
    confirm,
    mismatch,
    cancel: vi.fn(),
  };
  const verifier = Object.assign(new EventEmitter(), {
    verify: vi.fn(() => verified),
    getShowSasCallbacks: () => null,
  });
  const request = Object.assign(new EventEmitter(), {
    transactionId: "flow-one",
    otherUserId: "@peer:example",
    otherDeviceId: "DEVICE",
    initiatedByMe: false,
    phase: VerificationPhase.Requested,
    pending: true,
    verifier: undefined as Verifier | undefined,
    accept: vi.fn(async () => {
      request.phase = VerificationPhase.Ready;
      request.emit(VerificationRequestEvent.Change);
    }),
    cancel: vi.fn(async () => {
      request.pending = false;
      request.phase = VerificationPhase.Cancelled;
      request.emit(VerificationRequestEvent.Change);
    }),
    startVerification: vi.fn(async () => verifier as unknown as Verifier),
  });
  const client = Object.assign(emitter, {
    getCrypto: () => ({
      requestOwnUserVerification: async () =>
        request as unknown as VerificationRequest,
    }),
  });
  const controller = new MatrixVerificationController(
    client as unknown as MatrixClient,
  );
  const receive = () =>
    emitter.emit(CryptoEvent.VerificationRequestReceived, request);
  const compare = () => {
    request.verifier = verifier as unknown as Verifier;
    request.phase = VerificationPhase.Started;
    request.emit(VerificationRequestEvent.Change);
    verifier.emit(VerifierEvent.ShowSas, sas);
  };
  return {
    controller,
    emitter,
    request,
    verifier,
    receive,
    compare,
    confirm,
    mismatch,
    complete,
  };
}

describe("SDK SAS approval boundary", () => {
  it("never approves an incoming request or matching codes automatically", async () => {
    const f = fixture();
    f.receive();
    expect(f.request.accept).not.toHaveBeenCalled();
    await f.controller.accept("flow-one");
    f.compare();
    expect(f.controller.snapshot().phase).toBe("comparing");
    expect(f.confirm).not.toHaveBeenCalled();
    await f.controller.confirm("flow-one");
    expect(f.confirm).toHaveBeenCalledOnce();
    expect(f.controller.snapshot().phase).toBe("waiting");
    f.complete();
    await vi.waitFor(() => expect(f.controller.snapshot().phase).toBe("done"));
    f.controller.close();
  });
  it("refuses confirmation from a stale screen and rejects mismatched codes", async () => {
    const f = fixture();
    f.receive();
    f.compare();
    await expect(f.controller.confirm("previous-flow")).rejects.toThrow();
    expect(f.confirm).not.toHaveBeenCalled();
    f.controller.mismatch("flow-one");
    expect(f.mismatch).toHaveBeenCalledOnce();
    expect(f.controller.snapshot().phase).toBe("cancelled");
    expect(f.confirm).not.toHaveBeenCalled();
    f.controller.close();
  });
  it("fences late callbacks and removes SDK listeners when the session locks", async () => {
    const f = fixture();
    f.receive();
    f.compare();
    f.controller.close();
    f.complete();
    f.verifier.emit(VerifierEvent.ShowSas, { sas: { decimal: [1, 2, 3] } });
    await Promise.resolve();
    expect(f.controller.snapshot().phase).toBe("idle");
    expect(
      f.emitter.listenerCount(CryptoEvent.VerificationRequestReceived),
    ).toBe(0);
    expect(f.confirm).not.toHaveBeenCalled();
    await expect(f.controller.confirm("flow-one")).rejects.toThrow("закрыта");
  });
});
