import type { MatrixBackendConfig } from "./matrixApi";
import { secureOrigin } from "./matrixApi";

/** Validate every discovery response, including discovery during refresh/logout. */
export function pinnedMatrixFetch(config: MatrixBackendConfig): typeof fetch {
  const homeserver = secureOrigin(config.homeserverURL);
  const issuer = secureOrigin(config.issuerURL);
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== homeserver)
      throw new Error("Запрос к неизвестному серверу переписки запрещён");
    const response = await fetch(input, {
      ...init,
      redirect: "error",
      credentials: "omit",
    });
    if (response.ok && url.pathname === "/_matrix/client/v1/auth_metadata") {
      const metadata = await response.clone().json();
      if (
        typeof metadata.issuer !== "string" ||
        metadata.issuer.replace(/\/$/, "") !== issuer ||
        [
          metadata.authorization_endpoint,
          metadata.token_endpoint,
          metadata.revocation_endpoint,
        ].some(
          (endpoint) =>
            typeof endpoint !== "string" || new URL(endpoint).origin !== issuer,
        )
      )
        throw new Error("Сервер входа изменился. Передача токенов запрещена");
    }
    return response;
  };
}
