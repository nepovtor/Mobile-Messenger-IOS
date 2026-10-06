import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "matrix-js-sdk";
import { withMatrixCryptoSession } from "./matrixCryptoSession";

vi.mock("matrix-js-sdk", () => ({ createClient: vi.fn() }));

const credentials = {
  homeserverURL: "https://matrix.example.test",
  userID: "@alice:example.test",
  deviceID: "IOS1",
  accessToken: "matrix-access-token",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("indexedDB", {});
  vi.stubGlobal("crypto", webcrypto);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: vi.fn((_name, _options, callback) => callback({ name: "lock" })),
    },
  });
});

describe("Matrix crypto store startup", () => {
  it("refuses to initialize without a 32-byte wrapping key", async () => {
    await expect(
      withMatrixCryptoSession(credentials, new Uint8Array(0), async () => null),
    ).rejects.toThrow("32-byte wrapping key");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses concurrent access to the same encrypted IndexedDB store", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: vi.fn((_name, _options, callback) => callback(null)) },
    });
    await expect(
      withMatrixCryptoSession(
        credentials,
        new Uint8Array(32),
        async () => null,
      ),
    ).rejects.toThrow("already open in another tab");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("initializes Rust crypto with an encrypted store and closes the client", async () => {
    const cryptoAPI = { bootstrapSecretStorage: vi.fn() };
    const client = {
      initRustCrypto: vi.fn().mockResolvedValue(undefined),
      startClient: vi.fn().mockResolvedValue(undefined),
      getCrypto: vi.fn().mockReturnValue(cryptoAPI),
      stopClient: vi.fn(),
    };
    vi.mocked(createClient).mockReturnValue(client as never);
    const wrappingKey = new Uint8Array(32).fill(7);

    const result = await withMatrixCryptoSession(
      credentials,
      wrappingKey,
      async (crypto) => {
        expect(crypto).toBe(cryptoAPI);
        expect(client.startClient).toHaveBeenCalledOnce();
        return "ready";
      },
    );

    expect(result).toBe("ready");
    expect(client.initRustCrypto).toHaveBeenCalledWith(
      expect.objectContaining({
        useIndexedDB: true,
        storageKey: expect.any(Uint8Array),
      }),
    );
    const storeKey = client.initRustCrypto.mock.calls[0]?.[0]
      ?.storageKey as Uint8Array;
    expect(storeKey).not.toBe(wrappingKey);
    expect(storeKey).toEqual(new Uint8Array(32));
    expect(wrappingKey).toEqual(new Uint8Array(32).fill(7));
    expect(client.stopClient).toHaveBeenCalledOnce();
  });
});
