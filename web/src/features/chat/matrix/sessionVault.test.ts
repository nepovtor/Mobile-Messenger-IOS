// @vitest-environment node
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  UnlockedSessionVault,
  encodeBytes,
  type StoredMatrixSession,
} from "./sessionVault";

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});
const owner = "@u_alice:messenger.example";
const record: StoredMatrixSession = {
  userID: owner,
  deviceID: "device-one",
  homeserverURL: "https://matrix.example",
  issuerURL: "https://auth.example",
  clientID: "public-client",
  accessToken: "access-token-must-not-be-readable",
  refreshToken: "refresh-token-must-not-be-readable",
  cryptoStoreKey: encodeBytes(new Uint8Array(32).fill(7)),
  pendingMessages: [
    {
      transactionID: "pending-retry",
      chatID: "chat",
      body: "Unsent private text",
      createdAt: 1,
    },
  ],
};
const passphrase = "A long local passphrase";

describe("Matrix session vault", () => {
  it("restores the same device secrets without storing readable credentials", async () => {
    const vault = await UnlockedSessionVault.create(passphrase, owner);
    const sealed = await vault.seal(record);
    expect(JSON.stringify(sealed)).not.toContain(record.accessToken);
    expect(JSON.stringify(sealed)).not.toContain(record.refreshToken);
    expect(JSON.stringify(sealed)).not.toContain(record.cryptoStoreKey);
    expect(JSON.stringify(sealed)).not.toContain(
      record.pendingMessages![0].body,
    );
    const reopened = await UnlockedSessionVault.unlock(
      passphrase,
      owner,
      sealed,
    );
    expect(reopened.session).toEqual(record);
    vault.lock();
    reopened.vault.lock();
  });

  it("rejects a wrong passphrase and copying a vault to another account", async () => {
    const vault = await UnlockedSessionVault.create(passphrase, owner);
    const sealed = await vault.seal(record);
    await expect(
      UnlockedSessionVault.unlock("Wrong passphrase", owner, sealed),
    ).rejects.toThrow();
    await expect(
      UnlockedSessionVault.unlock(
        passphrase,
        "@u_bob:messenger.example",
        sealed,
      ),
    ).rejects.toThrow();
  });

  it("authenticates stored ciphertext and refuses subsequent writes after locking", async () => {
    const vault = await UnlockedSessionVault.create(passphrase, owner);
    const sealed = await vault.seal(record);
    const next = await vault.seal(record);
    expect(next.iv).not.toBe(sealed.iv);
    const tampered = {
      ...sealed,
      ciphertext:
        (sealed.ciphertext[0] === "A" ? "B" : "A") + sealed.ciphertext.slice(1),
    };
    await expect(
      UnlockedSessionVault.unlock(passphrase, owner, tampered),
    ).rejects.toThrow();
    vault.lock();
    await expect(vault.seal(record)).rejects.toThrow("Сессия закрыта");
  });
});
