// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { pinnedMatrixFetch } from "./pinnedMatrixFetch";
const config = {
  homeserverURL: "https://matrix.example",
  issuerURL: "https://auth.example",
  serverName: "matrix.example",
  expectedUserID: "@alice:matrix.example",
  webClientID: "public-client",
};
const metadata = {
  issuer: config.issuerURL,
  authorization_endpoint: `${config.issuerURL}/authorize`,
  token_endpoint: `${config.issuerURL}/token`,
  revocation_endpoint: `${config.issuerURL}/revoke`,
};
afterEach(() => vi.unstubAllGlobals());

describe("Matrix auth discovery pinning", () => {
  it("accepts the configured issuer without forwarding browser cookies or redirects", async () => {
    const fetch = vi.fn(async () => Response.json(metadata));
    vi.stubGlobal("fetch", fetch);
    await expect(
      pinnedMatrixFetch(config)(
        `${config.homeserverURL}/_matrix/client/v1/auth_metadata`,
      ),
    ).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
  });
  it.each(["issuer", "token_endpoint", "revocation_endpoint"])(
    "blocks a changed %s during rediscovery",
    async (field) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            ...metadata,
            [field]: "https://foreign.example/collect",
          }),
        ),
      );
      await expect(
        pinnedMatrixFetch(config)(
          `${config.homeserverURL}/_matrix/client/v1/auth_metadata`,
        ),
      ).rejects.toThrow("Передача токенов запрещена");
    },
  );
});
