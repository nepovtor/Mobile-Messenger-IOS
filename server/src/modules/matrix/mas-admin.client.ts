import { MatrixConfig, matrixUserID } from "./matrix.config";

const ulid = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
// MAS lock responses contain the Rust clock's nanoseconds. Its PostgreSQL
// storage truncates to microseconds; compare the persisted precision without
// reducing it further to JavaScript Date's milliseconds.
function lockMarker(value: string): string {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value)))
    throw new Error("Invalid MAS lock timestamp");
  return `${match[1]}.${(match[2] ?? "").padEnd(6, "0").slice(0, 6)}Z`;
}
type Resource = {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
};

/** Only the private worker has this credential; it never returns it to clients. */
export class MasAdminClient {
  constructor(
    private readonly config: MatrixConfig,
    private readonly request: typeof fetch = fetch,
    private readonly deadline = AbortSignal.timeout(25_000),
  ) {}

  private async json(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(5000), this.deadline]),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("MAS session revocation unavailable");
    if (response.status === 204) return undefined;
    try {
      return await response.json();
    } catch {
      throw new Error("Invalid MAS response");
    }
  }

  async token(): Promise<string> {
    const result = (await this.json(`${this.config.issuerURL}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.config.adminClientID}:${this.config.adminSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "urn:mas:admin",
      }).toString(),
    })) as {
      access_token?: unknown;
      token_type?: unknown;
      scope?: unknown;
    } | null;
    if (
      !result ||
      typeof result.access_token !== "string" ||
      result.token_type?.toString().toLowerCase() !== "bearer" ||
      typeof result.scope !== "string" ||
      !result.scope.split(" ").includes("urn:mas:admin")
    ) {
      throw new Error("MAS did not grant administrative session scope");
    }
    return result.access_token;
  }

  private async api(
    path: string,
    token: string,
    method = "GET",
  ): Promise<unknown> {
    return this.json(`${this.config.adminURL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async findUser(
    subject: string,
    token: string,
  ): Promise<{ id: string; lockedAt: string | null } | null> {
    matrixUserID(subject, this.config.serverName);
    const username = `u_${subject.replaceAll("-", "")}`;
    const result = (await this.api(
      `/api/admin/v1/users/by-username/${username}`,
      token,
    )) as { data?: Resource } | null;
    if (!result) return null;
    const data = result.data;
    if (
      !data ||
      data.type !== "user" ||
      !ulid.test(data.id) ||
      data.attributes["username"] !== username
    ) {
      throw new Error("MAS account identity mismatch");
    }
    const lockedAt = data.attributes["locked_at"];
    if (lockedAt !== null && typeof lockedAt !== "string")
      throw new Error("Invalid MAS lock state");
    return {
      id: data.id,
      lockedAt: lockedAt === null ? null : lockMarker(lockedAt),
    };
  }

  async lockUser(id: string, token: string): Promise<string> {
    if (!ulid.test(id)) throw new Error("Invalid MAS account identity");
    const result = await this.api(
      `/api/admin/v1/users/${id}/lock`,
      token,
      "POST",
    );
    const data = (result as { data?: Resource } | null)?.data;
    if (
      !data ||
      data.id !== id ||
      data.type !== "user" ||
      typeof data.attributes["locked_at"] !== "string"
    )
      throw new Error("Invalid MAS account lock");
    return lockMarker(data.attributes["locked_at"]);
  }

  async finishSessions(id: string, token: string): Promise<void> {
    for (const [kind, filter, action] of [
      ["user-sessions", "user", "finish"],
      ["oauth2-sessions", "user", "finish"],
      ["compat-sessions", "user", "finish"],
      ["personal-sessions", "owner_user", "revoke"],
      ["personal-sessions", "actor_user", "revoke"],
    ]) {
      if (!kind || !filter || !action) throw new Error("Invalid MAS resource");
      let empty = false;
      // Always fetch the first active page: finishing it removes these rows
      // from the filter. Never follow a server-supplied URL with the credential.
      for (let batch = 0; batch < 100; batch += 1) {
        const query = new URLSearchParams({
          [`filter[${filter}]`]: id,
          "filter[status]": "active",
          "page[first]": "100",
        });
        const result = (await this.api(
          `/api/admin/v1/${kind}?${query}`,
          token,
        )) as { data?: Resource[] } | null;
        if (!result || !Array.isArray(result.data) || result.data.length > 100)
          throw new Error("Invalid MAS session page");
        if (result.data.length === 0) {
          empty = true;
          break;
        }
        for (const item of result.data) {
          if (
            item.type !== kind.slice(0, -1) ||
            !ulid.test(item.id) ||
            item.attributes[filter === "user" ? "user_id" : `${filter}_id`] !==
              id
          ) {
            throw new Error("MAS returned a foreign session");
          }
          if (
            (await this.api(
              `/api/admin/v1/${kind}/${item.id}/${action}`,
              token,
              "POST",
            )) === null
          ) {
            throw new Error("MAS session disappeared during revocation");
          }
        }
      }
      if (!empty) throw new Error("MAS session limit exceeded");
    }
  }

  async unlockUser(id: string, token: string): Promise<void> {
    if (
      (await this.api(`/api/admin/v1/users/${id}/unlock`, token, "POST")) ===
      null
    )
      throw new Error("MAS unlock unavailable");
  }
}
