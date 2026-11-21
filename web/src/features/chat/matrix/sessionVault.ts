import {
  assertPendingMessages,
  type PendingSecureMessage,
} from "./messageOutbox";

export type StoredMatrixSession = {
  homeserverURL: string;
  issuerURL: string;
  clientID: string;
  userID: string;
  deviceID: string;
  accessToken: string;
  refreshToken?: string;
  cryptoStoreKey: string;
  pendingMessages?: PendingSecureMessage[];
};

export type SealedSession = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
};

const iterations = 600_000;
const encoder = new TextEncoder();

export function encodeBytes(value: Uint8Array): string {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}

export function decodeBytes(value: string): Uint8Array<ArrayBuffer> {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error("Некорректный формат локального хранилища");
  }
  const bytes = Uint8Array.from(atob(value), (character) =>
    character.charCodeAt(0),
  );
  if (encodeBytes(bytes) !== value)
    throw new Error("Некорректный формат локального хранилища");
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function assertSession(
  value: unknown,
  owner: string,
): asserts value is StoredMatrixSession {
  if (!value || typeof value !== "object")
    throw new Error("Локальная сессия повреждена");
  const record = value as Record<string, unknown>;
  for (const field of [
    "homeserverURL",
    "issuerURL",
    "clientID",
    "userID",
    "deviceID",
    "accessToken",
    "cryptoStoreKey",
  ]) {
    if (typeof record[field] !== "string" || !record[field])
      throw new Error("Локальная сессия повреждена");
  }
  if (record.pendingMessages !== undefined)
    assertPendingMessages(record.pendingMessages);
  if (
    record.userID !== owner ||
    decodeBytes(record.cryptoStoreKey as string).length !== 32 ||
    (record.refreshToken !== undefined &&
      typeof record.refreshToken !== "string")
  ) {
    throw new Error(
      "Локальная сессия принадлежит другому аккаунту или повреждена",
    );
  }
}

/** Local storage encryption only. Matrix message encryption belongs to the SDK. */
export class UnlockedSessionVault {
  private active = true;
  private constructor(
    private readonly key: CryptoKey,
    private readonly salt: Uint8Array<ArrayBuffer>,
    private readonly owner: string,
  ) {}

  static async create(
    passphrase: string,
    owner: string,
  ): Promise<UnlockedSessionVault> {
    if (passphrase.length < 12 || passphrase.length > 1024)
      throw new Error("Используйте пароль от 12 до 1024 символов");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return new UnlockedSessionVault(
      await deriveKey(passphrase, salt),
      salt,
      owner,
    );
  }

  static async unlock(
    passphrase: string,
    owner: string,
    sealed: SealedSession,
  ): Promise<{ vault: UnlockedSessionVault; session: StoredMatrixSession }> {
    if (
      passphrase.length > 1024 ||
      !sealed ||
      typeof sealed !== "object" ||
      sealed.version !== 1 ||
      typeof sealed.salt !== "string" ||
      sealed.salt.length !== 24 ||
      typeof sealed.iv !== "string" ||
      sealed.iv.length !== 16 ||
      typeof sealed.ciphertext !== "string" ||
      sealed.ciphertext.length > 1_000_000
    )
      throw new Error("Локальное хранилище повреждено");
    const salt = decodeBytes(sealed.salt);
    const iv = decodeBytes(sealed.iv);
    if (salt.length !== 16 || iv.length !== 12)
      throw new Error("Локальное хранилище повреждено");
    const key = await deriveKey(passphrase, salt);
    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: encoder.encode(
            `mobile-messenger/session/v1/${owner}`,
          ),
        },
        key,
        decodeBytes(sealed.ciphertext),
      );
    } catch {
      throw new Error("Не удалось открыть сессию: проверьте пароль");
    }
    try {
      const session: unknown = JSON.parse(new TextDecoder().decode(plaintext));
      assertSession(session, owner);
      return { vault: new UnlockedSessionVault(key, salt, owner), session };
    } finally {
      new Uint8Array(plaintext).fill(0);
    }
  }

  async seal(session: StoredMatrixSession): Promise<SealedSession> {
    if (!this.active) throw new Error("Сессия закрыта");
    assertSession(session, this.owner);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = encoder.encode(JSON.stringify(session));
    try {
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: encoder.encode(
            `mobile-messenger/session/v1/${this.owner}`,
          ),
        },
        this.key,
        plaintext,
      );
      if (!this.active) throw new Error("Сессия закрыта");
      return {
        version: 1,
        salt: encodeBytes(this.salt),
        iv: encodeBytes(iv),
        ciphertext: encodeBytes(new Uint8Array(ciphertext)),
      };
    } finally {
      plaintext.fill(0);
    }
  }

  lock(): void {
    this.active = false;
  }
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mobile-messenger-matrix-session-v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("sessions");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Не удалось открыть локальное хранилище"));
    request.onblocked = () =>
      reject(new Error("Закройте другие вкладки приложения"));
  });
}

export async function readSealedSession(
  owner: string,
): Promise<SealedSession | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("sessions", "readonly")
        .objectStore("sessions")
        .get(owner);
      request.onsuccess = () =>
        resolve(request.result as SealedSession | undefined);
      request.onerror = () => reject(new Error("Не удалось прочитать сессию"));
    });
  } finally {
    db.close();
  }
}

export async function writeSealedSession(
  owner: string,
  record: SealedSession | null,
): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      if (record) store.put(record, owner);
      else store.delete(owner);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error("Не удалось сохранить сессию"));
    });
  } finally {
    db.close();
  }
}

/** Retire revoked credentials without deleting encrypted unsent drafts or old SDK stores. */
export async function retireSealedSessions(
  applicationUserID: string,
): Promise<void> {
  const normalized = applicationUserID.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized) || typeof indexedDB === "undefined")
    return;
  const prefix = `@u_${normalized}:`;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (
          typeof entry.key === "string" &&
          entry.key.startsWith(prefix) &&
          !entry.key.includes("\0")
        ) {
          store.put(
            entry.value,
            `${entry.key}\0retired/${crypto.randomUUID()}`,
          );
          entry.delete();
        }
        entry.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error("Не удалось закрыть локальную сессию устройства"));
    });
  } finally {
    db.close();
  }
}
