// @vitest-environment node
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  UnlockedSessionVault,
  encodeBytes,
  readSealedSession,
  writeSealedSession,
  retireSealedSessions,
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
  it("retires acknowledged credentials atomically while retaining encrypted drafts and foreign accounts", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const scopedOwner = "@u_aaaaaaaabbbbccccddddeeeeeeeeeeee:matrix.example";
    const vault = await UnlockedSessionVault.create(passphrase, scopedOwner);
    const originalRecord = { ...record, userID: scopedOwner };
    const sealed = await vault.seal(originalRecord);
    await writeSealedSession(scopedOwner, sealed);
    const otherOwner = "@u_ffffffffbbbbccccddddeeeeeeeeeeee:matrix.example";
    await writeSealedSession(otherOwner, sealed);
    await retireSealedSessions(id);
    expect(await readSealedSession(scopedOwner)).toBeUndefined();
    expect(await readSealedSession(otherOwner)).toEqual(sealed);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("mobile-messenger-matrix-session-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve) => {
      const request = db
        .transaction("sessions")
        .objectStore("sessions")
        .getAllKeys();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    const archivedKey = keys.find(
      (key) =>
        typeof key === "string" && key.startsWith(scopedOwner + "\0retired/"),
    );
    expect(archivedKey).toBeDefined();
    const archived = await readSealedSession(archivedKey as string);
    expect(archived).toEqual(sealed);
    const restored = await UnlockedSessionVault.unlock(
      passphrase,
      scopedOwner,
      archived!,
    );
    expect(restored.session.pendingMessages).toEqual(
      originalRecord.pendingMessages,
    );
    expect(JSON.stringify(archived)).not.toContain("Unsent private text");
    restored.vault.lock();
    vault.lock();
    vi.unstubAllGlobals();
  });
});
