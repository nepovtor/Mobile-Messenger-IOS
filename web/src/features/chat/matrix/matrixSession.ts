import {
  ClientEvent,
  SyncState,
  createClient,
  type MatrixClient,
} from "matrix-js-sdk";
import { OAuth2 } from "matrix-js-sdk/lib/oauth";
import {
  OnlySignedDevicesIsolationMode,
  decodeRecoveryKey,
} from "matrix-js-sdk/lib/crypto-api";
import type { Logger } from "matrix-js-sdk/lib/logger";
import { secureOrigin, type MatrixBackendConfig } from "./matrixApi";
import { pinnedMatrixFetch } from "./pinnedMatrixFetch";
import { SecureMessageOutbox } from "./messageOutbox";
import { MatrixRoomTransport } from "./matrixRoomTransport";
import {
  UnlockedSessionVault,
  decodeBytes,
  encodeBytes,
  writeSealedSession,
  type StoredMatrixSession,
} from "./sessionVault";

const protectedLogger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  getChild: () => protectedLogger,
};

export async function authorizeMatrix(
  config: MatrixBackendConfig,
  signal?: AbortSignal,
): Promise<StoredMatrixSession> {
  signal?.throwIfAborted();
  const popup = window.open(
    "about:blank",
    "mobile-messenger-auth",
    "popup,width=520,height=720",
  );
  if (!popup) throw new Error("Разрешите открытие окна входа");
  const redirectURI = `${window.location.origin}/matrix/callback`;
  const deviceID = crypto.randomUUID();
  const client = createClient({
    baseUrl: secureOrigin(config.homeserverURL),
    localTimeoutMs: 20_000,
    logger: protectedLogger,
    fetchFn: pinnedMatrixFetch(config),
  });
  try {
    const metadata = await client.getAuthMetadata();
    signal?.throwIfAborted();
    if (
      metadata.issuer.replace(/\/$/, "") !== secureOrigin(config.issuerURL) ||
      [
        metadata.authorization_endpoint,
        metadata.token_endpoint,
        metadata.revocation_endpoint,
      ].some(
        (endpoint) =>
          new URL(endpoint).origin !== secureOrigin(config.issuerURL),
      )
    ) {
      throw new Error("Сервер входа не совпадает с настройками организации");
    }
    const auth = new OAuth2(
      metadata,
      { clientId: config.webClientID, deviceId: deviceID },
      protectedLogger,
    );
    const state = crypto.randomUUID();
    const authorizationURL = await auth.generateAuthorizationCodeGrantUrl(
      state,
      redirectURI,
      "fragment",
    );
    const code = await new Promise<string>((resolve, reject) => {
      let completed = false;
      const finish = (result: string | Error) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        clearInterval(closed);
        window.removeEventListener("message", receive);
        signal?.removeEventListener("abort", aborted);
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      const receive = (event: MessageEvent) => {
        if (
          event.origin !== window.location.origin ||
          event.source !== popup ||
          event.data?.type !== "matrix.oauth.callback"
        )
          return;
        if (event.data.state !== state)
          return finish(new Error("Не удалось проверить ответ сервера входа"));
        if (
          typeof event.data.code !== "string" ||
          !event.data.code ||
          event.data.code.length > 4096
        )
          return finish(new Error("Вход отменён или отклонён"));
        finish(event.data.code);
      };
      const aborted = () => {
        popup.close();
        finish(new Error("Вход отменён"));
      };
      const timeout = window.setTimeout(
        () => finish(new Error("Время ожидания входа истекло")),
        300_000,
      );
      const closed = window.setInterval(() => {
        if (popup.closed) finish(new Error("Окно входа закрыто"));
      }, 500);
      window.addEventListener("message", receive);
      signal?.addEventListener("abort", aborted, { once: true });
      if (signal?.aborted) return aborted();
      popup.location.replace(authorizationURL);
    });
    const token = await auth.completeAuthorizationCodeGrant(code, redirectURI);
    const authenticated = createClient({
      baseUrl: secureOrigin(config.homeserverURL),
      accessToken: token.access_token,
      localTimeoutMs: 20_000,
      logger: protectedLogger,
      fetchFn: pinnedMatrixFetch(config),
    });
    const identity = await authenticated.whoami();
    if (
      signal?.aborted ||
      identity.user_id !== config.expectedUserID ||
      identity.device_id !== deviceID
    ) {
      await auth
        .revokeToken(token.access_token, "access_token")
        .catch(() => undefined);
      if (token.refresh_token)
        await auth
          .revokeToken(token.refresh_token, "refresh_token")
          .catch(() => undefined);
      throw new Error(
        "Выполнен вход в другой аккаунт. Используйте номер текущего профиля",
      );
    }
    return {
      homeserverURL: secureOrigin(config.homeserverURL),
      issuerURL: secureOrigin(config.issuerURL),
      clientID: config.webClientID,
      userID: identity.user_id,
      deviceID,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      cryptoStoreKey: encodeBytes(crypto.getRandomValues(new Uint8Array(32))),
    };
  } finally {
    popup.close();
    client.stopClient();
  }
}

export class MatrixSession {
  client?: MatrixClient;
  transport?: MatrixRoomTransport;
  outbox?: SecureMessageOutbox;
  private removeSyncListener?: () => void;
  private active = true;
  private releaseLock?: () => void;
  private lockTask?: Promise<void>;
  private saves: Promise<void> = Promise.resolve();
  private recoveryKeys = new Map<string, Uint8Array<ArrayBuffer>>();
  private stopSyncWait?: () => void;
  private changingRecovery = false;

  constructor(
    private readonly config: MatrixBackendConfig,
    private record: StoredMatrixSession,
    private readonly vault: UnlockedSessionVault,
    private readonly onError: (message: string, fatal?: boolean) => void,
  ) {}

  async open(): Promise<void> {
    if (
      !globalThis.isSecureContext ||
      !navigator.locks ||
      !globalThis.indexedDB
    )
      throw new Error(
        "Для защищённой переписки нужен браузер с HTTPS и локальным хранилищем",
      );
    if (
      this.record.userID !== this.config.expectedUserID ||
      this.record.homeserverURL !== secureOrigin(this.config.homeserverURL) ||
      this.record.issuerURL !== secureOrigin(this.config.issuerURL) ||
      this.record.clientID !== this.config.webClientID
    ) {
      throw new Error("Сессия не соответствует текущему аккаунту или серверу");
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `${this.record.homeserverURL}\0${this.record.userID}\0${this.record.deviceID}`,
      ),
    );
    const storeID = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    let ready!: () => void;
    let failed!: (error: unknown) => void;
    const initialized = new Promise<void>((resolve, reject) => {
      ready = resolve;
      failed = reject;
    });
    this.lockTask = navigator.locks
      .request(
        `mobile-messenger-matrix-${storeID}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error(
              "Защищённая переписка уже открыта в другой вкладке",
            );
          const stopped = new Promise<void>((resolve) => {
            this.releaseLock = resolve;
          });
          const key = decodeBytes(this.record.cryptoStoreKey);
          try {
            if (!this.active) throw new Error("Вход отменён");
            const client = createClient({
              baseUrl: this.record.homeserverURL,
              userId: this.record.userID,
              deviceId: this.record.deviceID,
              accessToken: this.record.accessToken,
              refreshToken: this.record.refreshToken,
              oauthClientId: this.record.clientID,
              localTimeoutMs: 20_000,
              logger: protectedLogger,
              fetchFn: pinnedMatrixFetch(this.config),
              onTokenRefresh: (tokens) => {
                if (!this.active) return;
                this.record = {
                  ...this.record,
                  accessToken: tokens.accessToken,
                  refreshToken: tokens.refreshToken,
                };
                this.queueSave();
              },
              cryptoCallbacks: {
                getSecretStorageKey: async ({ keys }) => {
                  const keyID = Object.keys(keys).find((id) =>
                    this.recoveryKeys.has(id),
                  );
                  return keyID ? [keyID, this.recoveryKeys.get(keyID)!] : null;
                },
                cacheSecretStorageKey: (keyID, _info, value) => {
                  this.recoveryKeys.get(keyID)?.fill(0);
                  this.recoveryKeys.set(keyID, new Uint8Array(value));
                },
              },
            });
            this.client = client;
            const identity = await client.whoami();
            if (!this.active) throw new Error("Сессия закрыта");
            if (
              identity.user_id !== this.record.userID ||
              identity.device_id !== this.record.deviceID
            )
              throw new Error("Сессия устройства недействительна");
            const metadata = await client.getAuthMetadata();
            if (metadata.issuer.replace(/\/$/, "") !== this.record.issuerURL)
              throw new Error("Сервер входа изменился");
            if (!this.active) throw new Error("Сессия закрыта");
            await client.initRustCrypto({
              cryptoDatabasePrefix: `mobile-messenger-matrix-${storeID}`,
              storageKey: key,
              useIndexedDB: true,
            });
            if (!this.active) throw new Error("Сессия закрыта");
            const cryptoAPI = client.getCrypto();
            if (!cryptoAPI)
              throw new Error("Не удалось открыть хранилище ключей");
            cryptoAPI.setDeviceIsolationMode(
              new OnlySignedDevicesIsolationMode(),
            );
            this.transport = new MatrixRoomTransport(client);
            const synced = new Promise<void>((resolve, reject) => {
              const timer = window.setTimeout(
                () =>
                  finish(
                    new Error(
                      "Не удалось синхронизировать переписку. Проверьте соединение",
                    ),
                  ),
                30_000,
              );
              const finish = (error?: Error) => {
                window.clearTimeout(timer);
                client.removeListener(ClientEvent.Sync, onSync);
                this.stopSyncWait = undefined;
                if (error) reject(error);
                else resolve();
              };
              const onSync = (state: SyncState) => {
                if (state === SyncState.Prepared || state === SyncState.Syncing)
                  finish();
              };
              this.stopSyncWait = () => finish(new Error("Сессия закрыта"));
              client.on(ClientEvent.Sync, onSync);
            });
            void synced.catch(() => undefined);
            await client.startClient({ initialSyncLimit: 100 });
            await synced;
            if (!this.active) throw new Error("Сессия закрыта");
            await this.save();
            this.outbox = new SecureMessageOutbox(
              this.record.pendingMessages ?? [],
              async (pendingMessages) => {
                if (!this.active) throw new Error("Сессия закрыта");
                this.record = { ...this.record, pendingMessages };
                try {
                  await this.save();
                } catch (error) {
                  await this.close();
                  this.onError(
                    "Не удалось сохранить очередь. Переписка заблокирована",
                    true,
                  );
                  throw error;
                }
              },
              (message) =>
                this.transport!.sendText(
                  message.chatID,
                  message.body,
                  message.transactionID,
                ),
            );
            const retry = (state: SyncState, previous: SyncState | null) => {
              if (state === SyncState.Syncing && previous !== SyncState.Syncing)
                void this.outbox?.retry();
            };
            client.on(ClientEvent.Sync, retry);
            this.removeSyncListener = () =>
              client.removeListener(ClientEvent.Sync, retry);
            ready();
            void this.outbox.retry();
            await stopped;
          } finally {
            key.fill(0);
            this.client?.stopClient();
          }
        },
      )
      .catch((error: unknown) => {
        failed(error);
        if (this.active)
          this.onError(
            error instanceof Error
              ? error.message
              : "Защищённая переписка недоступна",
            true,
          );
      });
    try {
      await initialized;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private async persist(): Promise<void> {
    const sealed = await this.vault.seal(this.record);
    if (!this.active) return;
    await writeSealedSession(this.record.userID, sealed);
  }
  private save(): Promise<void> {
    const next = this.saves.then(() => this.persist());
    // Keep failures visible to the caller while allowing shutdown to await the chain.
    this.saves = next.catch(() => undefined);
    return next;
  }

  private queueSave(): void {
    void this.save().catch(() => {
      void this.close();
      this.onError(
        "Не удалось сохранить обновлённую сессию. Переписка заблокирована",
        true,
      );
    });
  }

  private requireActive(): void {
    if (!this.active) throw new Error("Сессия закрыта");
  }

  async setupRecovery(): Promise<string> {
    const client = this.client;
    const api = client?.getCrypto();
    if (!client || !api || !this.active)
      throw new Error("Сначала откройте защищённую переписку");
    if (this.changingRecovery)
      throw new Error("Дождитесь завершения настройки ключей");
    this.changingRecovery = true;
    try {
      if (await client.secretStorage.getDefaultKeyId())
        throw new Error(
          "Восстановление уже настроено. Используйте существующий ключ",
        );
      const existingIdentity = await api.userHasCrossSigningKeys(
        this.record.userID,
        true,
      );
      this.requireActive();
      if (existingIdentity && !(await api.isCrossSigningReady()))
        throw new Error(
          "У аккаунта уже есть ключи. Восстановите их или подтвердите устройство; новая идентичность не будет создана",
        );
      this.requireActive();
      const generated = await api.createRecoveryKeyFromPassphrase();
      this.requireActive();
      await api.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: (request) => request(null),
      });
      this.requireActive();
      if (!(await api.isCrossSigningReady()))
        throw new Error(
          "Сервер не подтвердил ключи устройства. Повторите настройку",
        );
      this.requireActive();
      await api.bootstrapSecretStorage({
        createSecretStorageKey: async () => generated,
        setupNewKeyBackup: true,
      });
      this.requireActive();
      await api.bootstrapCrossSigning({});
      this.requireActive();
      if (!generated.encodedPrivateKey)
        throw new Error("Не удалось создать ключ восстановления");
      return generated.encodedPrivateKey;
    } finally {
      this.changingRecovery = false;
    }
  }

  async recover(recoveryKey: string): Promise<void> {
    const client = this.client;
    const api = client?.getCrypto();
    if (!client || !api || !this.active) throw new Error("Сессия закрыта");
    if (this.changingRecovery)
      throw new Error("Дождитесь завершения настройки ключей");
    this.changingRecovery = true;
    let keyID: string | null = null;
    try {
      keyID = await client.secretStorage.getDefaultKeyId();
      this.requireActive();
      if (!keyID) throw new Error("Восстановление ещё не настроено");
      this.recoveryKeys.set(keyID, decodeRecoveryKey(recoveryKey));
      // bootstrapCrossSigning creates a new identity if any private key is missing.
      // Verify that all existing secrets can be read before allowing the SDK call.
      for (const name of [
        "m.cross_signing.master",
        "m.cross_signing.self_signing",
        "m.cross_signing.user_signing",
      ]) {
        const value = await client.secretStorage.get(name);
        this.requireActive();
        if (!value)
          throw new Error(
            "В хранилище отсутствуют ключи идентичности. Автоматический сброс запрещён",
          );
      }
      await api.bootstrapCrossSigning({});
      this.requireActive();
      await api.loadSessionBackupPrivateKeyFromSecretStorage();
      this.requireActive();
      await api.restoreKeyBackup();
    } catch (error) {
      if (keyID) {
        this.recoveryKeys.get(keyID)?.fill(0);
        this.recoveryKeys.delete(keyID);
      }
      throw error;
    } finally {
      this.changingRecovery = false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client?.logout(true);
    } catch {
      await this.close();
      throw new Error(
        "Сервер не подтвердил выход. Повторите отзыв устройства после восстановления соединения",
      );
    }
    await this.close();
    await this.saves.catch(() => undefined);
    await writeSealedSession(this.record.userID, null);
  }

  async close(): Promise<void> {
    this.active = false;
    this.outbox?.close();
    this.removeSyncListener?.();
    this.transport?.close();
    this.stopSyncWait?.();
    this.client?.stopClient();
    this.vault.lock();
    this.recoveryKeys.forEach((key) => key.fill(0));
    this.recoveryKeys.clear();
    this.releaseLock?.();
  }
}
