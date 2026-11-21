import type { MatrixClient } from "matrix-js-sdk";
import { encodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api";
import { describe, expect, it, vi } from "vitest";
import { MatrixSession } from "./matrixSession";
import type { UnlockedSessionVault } from "./sessionVault";

function fixture({
  existingIdentity = false,
  existingStorage = false,
  ready = false,
  secrets = true,
} = {}) {
  const api = {
    userHasCrossSigningKeys: vi.fn(async () => existingIdentity),
    isCrossSigningReady: vi.fn(async () => ready),
    createRecoveryKeyFromPassphrase: vi.fn(async () => ({
      encodedPrivateKey: "new-key",
    })),
    bootstrapCrossSigning: vi.fn(async () => {}),
    bootstrapSecretStorage: vi.fn(async () => {}),
    loadSessionBackupPrivateKeyFromSecretStorage: vi.fn(async () => {}),
    restoreKeyBackup: vi.fn(async () => {}),
  };
  const client = {
    getCrypto: () => api,
    secretStorage: {
      getDefaultKeyId: async () => (existingStorage ? "existing-key" : null),
      get: async () => (secrets ? "existing-private-key" : undefined),
    },
  } as unknown as MatrixClient;
  const record = {
    homeserverURL: "https://matrix.example",
    issuerURL: "https://auth.example",
    clientID: "client",
    userID: "@alice:matrix.example",
    deviceID: "device",
    accessToken: "token",
    cryptoStoreKey: "unused",
  };
  const session = new MatrixSession(
    {
      ...record,
      serverName: "matrix.example",
      webClientID: "client",
      expectedUserID: record.userID,
    },
    record,
    {} as UnlockedSessionVault,
    vi.fn(),
  );
  session.client = client;
  return { session, api };
}

describe("recovery preserves existing identity", () => {
  it("refuses to replace inaccessible account signing keys", async () => {
    const { session, api } = fixture({ existingIdentity: true });
    await expect(session.setupRecovery()).rejects.toThrow("уже есть ключи");
    expect(api.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(api.bootstrapSecretStorage).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing secret store", async () => {
    const { session, api } = fixture({ existingStorage: true });
    await expect(session.setupRecovery()).rejects.toThrow("уже настроено");
    expect(api.createRecoveryKeyFromPassphrase).not.toHaveBeenCalled();
  });

  it("does not bootstrap a new identity if recovery secrets are missing", async () => {
    const { session, api } = fixture({
      existingIdentity: true,
      existingStorage: true,
      secrets: false,
    });
    await expect(
      session.recover(encodeRecoveryKey(new Uint8Array(32).fill(7))!),
    ).rejects.toThrow("отсутствуют");
    expect(api.bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(api.restoreKeyBackup).not.toHaveBeenCalled();
  });

  it("uses the SDK to recover the existing identity before restoring backup", async () => {
    const { session, api } = fixture({
      existingIdentity: true,
      existingStorage: true,
    });
    await session.recover(encodeRecoveryKey(new Uint8Array(32).fill(7))!);
    expect(api.userHasCrossSigningKeys).toHaveBeenCalledWith(
      "@alice:matrix.example",
      true,
    );
    expect(api.bootstrapCrossSigning).toHaveBeenCalledExactlyOnceWith({});
    expect(api.restoreKeyBackup).toHaveBeenCalledOnce();
    expect(api.createRecoveryKeyFromPassphrase).not.toHaveBeenCalled();
  });
});
