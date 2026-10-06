import { readFileSync, statSync } from "node:fs";

export type MatrixConfig = {
  homeserverURL: string;
  issuerURL: string;
  serverName: string;
  webClientID: string;
  adminURL: string;
  adminClientID: string;
  adminSecret: string;
};

export function matrixEnabled(): boolean {
  return process.env["MATRIX_ENABLED"] === "true";
}

export function matrixURL(value: string | undefined): string {
  if (!value) throw new Error("Missing Matrix endpoint configuration");
  const url = new URL(value);
  const development =
    process.env["NODE_ENV"] !== "production" &&
    process.env["MATRIX_ALLOW_INSECURE_LOCAL"] === "true" &&
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(development && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Matrix endpoints require canonical HTTPS origins");
  }
  return url.origin;
}

export function matrixConfig(): MatrixConfig | null {
  if (!matrixEnabled()) return null;
  const homeserverURL = matrixURL(process.env["MATRIX_HOMESERVER_URL"]);
  const issuerURL = matrixURL(process.env["MATRIX_ISSUER_URL"]);
  if (issuerURL === homeserverURL)
    throw new Error("Matrix authentication requires an isolated origin");
  const serverName = process.env["MATRIX_SERVER_NAME"] ?? "";
  if (
    !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(serverName) ||
    serverName.length > 255
  ) {
    throw new Error("Invalid Matrix server name");
  }
  const secretPath = process.env["MATRIX_MAS_CLIENT_SECRET_FILE"];
  if (!secretPath || (statSync(secretPath).mode & 0o077) !== 0) {
    throw new Error("MAS client secret requires a private file");
  }
  const adminSecret = readFileSync(secretPath, "utf8").trim();
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(adminSecret) ||
    Buffer.from(adminSecret, "base64url").length !== 32 ||
    Buffer.from(adminSecret, "base64url").toString("base64url") !== adminSecret
  ) {
    throw new Error("MAS client secret requires 256 random bits");
  }
  const webClientID = process.env["MATRIX_WEB_CLIENT_ID"] ?? "";
  const adminClientID = process.env["MATRIX_MAS_CLIENT_ID"] ?? "";
  if (
    ![webClientID, adminClientID].every((id) =>
      /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id),
    ) ||
    webClientID === adminClientID
  ) {
    throw new Error("Distinct static MAS client IDs are required");
  }
  return {
    homeserverURL,
    issuerURL,
    serverName,
    webClientID,
    adminURL: matrixURL(process.env["MATRIX_MAS_ADMIN_URL"]),
    adminClientID,
    adminSecret,
  };
}

export function matrixUserID(subject: string, serverName: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      subject,
    )
  ) {
    throw new Error("Invalid immutable account identity");
  }
  return `@u_${subject.replaceAll("-", "")}:${serverName}`;
}
