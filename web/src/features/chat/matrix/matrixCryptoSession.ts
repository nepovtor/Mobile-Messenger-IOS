import { createClient, type MatrixClient } from "matrix-js-sdk";
import type { CryptoApi } from "matrix-js-sdk/lib/crypto-api";

export type MatrixSessionCredentials = {
  homeserverURL: string;
  userID: string;
  deviceID: string;
  accessToken: string;
};

/**
 * Opens the official Rust-backed crypto store for one Matrix device. The caller
 * must obtain a 32-byte wrapping key from an interactive unlock or recovery
 * flow. This module never saves that key or the Matrix access token itself.
 *
 * The callback only receives CryptoApi: product messaging must not be enabled
 * until Matrix login, verification, room encryption and sync are integrated.
 */
export async function withMatrixCryptoSession<T>(
  credentials: MatrixSessionCredentials,
  wrappingKey: Uint8Array,
  useCrypto: (crypto: CryptoApi) => Promise<T>,
): Promise<T> {
  if (
    !globalThis.isSecureContext ||
    !globalThis.indexedDB ||
    !navigator.locks
  ) {
    throw new Error(
      "Matrix crypto requires a secure browser with IndexedDB and Web Locks",
    );
  }
  if (wrappingKey.length !== 32) {
    throw new Error("Matrix crypto store requires a 32-byte wrapping key");
  }
  const homeserver = new URL(credentials.homeserverURL);
  const localDevelopment =
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(homeserver.hostname);
  if (
    (homeserver.protocol !== "https:" &&
      !(localDevelopment && homeserver.protocol === "http:")) ||
    homeserver.username ||
    homeserver.password ||
    homeserver.search ||
    homeserver.hash ||
    !credentials.userID ||
    !credentials.deviceID ||
    !credentials.accessToken
  ) {
    throw new Error("Invalid Matrix session credentials");
  }

  const baseURL = homeserver.href.replace(/\/$/, "");
  const identity = new TextEncoder().encode(
    `${baseURL}\0${credentials.userID}\0${credentials.deviceID}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", identity);
  const storeID = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return navigator.locks.request(
    `mobile-messenger-matrix-${storeID}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        throw new Error("Matrix crypto store is already open in another tab");
      }
      let client: MatrixClient | undefined;
      const keyCopy = new Uint8Array(wrappingKey);
      try {
        client = createClient({
          baseUrl: baseURL,
          userId: credentials.userID,
          deviceId: credentials.deviceID,
          accessToken: credentials.accessToken,
        });
        await client.initRustCrypto({
          useIndexedDB: true,
          cryptoDatabasePrefix: `mobile-messenger-matrix-${storeID}`,
          storageKey: keyCopy,
        });
        await client.startClient();
        const cryptoAPI = client.getCrypto();
        if (!cryptoAPI) {
          throw new Error("Matrix Rust crypto did not initialize");
        }
        return await useCrypto(cryptoAPI);
      } finally {
        keyCopy.fill(0);
        client?.stopClient();
      }
    },
  );
}
