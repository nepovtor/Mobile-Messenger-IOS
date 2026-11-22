// @vitest-environment node
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptAttachment } from "matrix-encrypt-attachment";
import type { MatrixClient } from "matrix-js-sdk";
import {
  attachmentBytes,
  downloadAttachment,
  prepareAttachment,
  validAttachment,
  type SecureAttachment,
} from "./encryptedAttachment";

const original = new TextEncoder().encode("Private attachment bytes");
const input = () =>
  ({
    name: "image.png",
    type: "image/png",
    size: original.length,
    arrayBuffer: async () => original.slice().buffer,
  }) as File;
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("Matrix encrypted attachments", () => {
  it("uses the official v2 helper and rejects tampered ciphertext", async () => {
    const prepared = await prepareAttachment(input());
    expect(validAttachment(prepared, true)).toBe(true);
    const encrypted = attachmentBytes(prepared);
    expect(encrypted).not.toEqual(original);
    expect(
      new Uint8Array(await decryptAttachment(encrypted.buffer, prepared.file)),
    ).toEqual(original);
    encrypted[0] ^= 1;
    await expect(
      decryptAttachment(encrypted.buffer, prepared.file),
    ).rejects.toThrow();
  });
  it("downloads only authenticated homeserver media and verifies hash before returning plaintext", async () => {
    const prepared = await prepareAttachment(input());
    const attachment: SecureAttachment = {
      ...prepared,
      file: { ...prepared.file, url: "mxc://matrix.example/media" },
    };
    const fetcher = vi.fn(async () => new Response(attachmentBytes(prepared)));
    vi.stubGlobal("fetch", fetcher);
    const client = {
      mxcUrlToHttp: () =>
        "https://matrix.example/_matrix/client/v1/media/download/matrix.example/media",
      getAccessToken: () => "synthetic-token",
      getHomeserverUrl: () => "https://matrix.example",
    } as unknown as MatrixClient;
    const blob = await downloadAttachment(
      client,
      attachment,
      new AbortController().signal,
    );
    expect(blob.size).toBe(original.length);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("https://matrix.example/"),
      expect.objectContaining({ redirect: "error", credentials: "omit" }),
    );
    const corrupt = attachmentBytes(prepared);
    corrupt[0] ^= 1;
    fetcher.mockImplementationOnce(async () => new Response(corrupt));
    await expect(
      downloadAttachment(client, attachment, new AbortController().signal),
    ).rejects.toThrow();
    client.mxcUrlToHttp = () => "https://foreign.example/stolen-token";
    await expect(
      downloadAttachment(client, attachment, new AbortController().signal),
    ).rejects.toThrow("адрес");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects active document formats and oversize files before encryption", async () => {
    await expect(
      prepareAttachment({ ...input(), type: "image/svg+xml" } as File),
    ).rejects.toThrow("Выберите");
    await expect(
      prepareAttachment({ ...input(), size: 11 * 1024 * 1024 } as File),
    ).rejects.toThrow("10 МБ");
  });
});
