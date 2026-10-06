import assert from "node:assert/strict";
import test from "node:test";
import { MasAdminClient } from "../src/modules/matrix/mas-admin.client";
import { MatrixConfig } from "../src/modules/matrix/matrix.config";
const id = "01K6Y0TP000000000000000001";
const session = "01K6Y0TP000000000000000002";
const config: MatrixConfig = {
  homeserverURL: "https://matrix.example.org",
  issuerURL: "https://mas.example.org",
  serverName: "example.org",
  webClientID: id,
  adminClientID: session,
  adminSecret: "test-only",
  adminURL: "https://private.example.org",
};

test("MAS revocation drains every session category, including delegated personal sessions", async () => {
  const seen = new Set<string>();
  const finished: string[] = [];
  const mock: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.redirect, "error");
    assert.equal(
      (init?.headers as Record<string, string>)["Authorization"],
      "Bearer test-token",
    );
    if (init?.method === "POST") {
      finished.push(url.pathname);
      return new Response(null, { status: 204 });
    }
    const key = url.pathname + url.search;
    const kind = url.pathname.split("/").at(-1)!;
    let data: unknown[] = [];
    if (!seen.has(key)) {
      seen.add(key);
      const filter = url.searchParams.has("filter[owner_user]")
        ? "owner_user_id"
        : url.searchParams.has("filter[actor_user]")
          ? "actor_user_id"
          : "user_id";
      assert.equal(url.searchParams.get("filter[status]"), "active");
      data = [
        { id: session, type: kind.slice(0, -1), attributes: { [filter]: id } },
      ];
    }
    return Response.json({
      data,
      links: { next: "https://attacker.invalid/steal" },
    });
  };
  await new MasAdminClient(config, mock).finishSessions(id, "test-token");
  assert.equal(finished.length, 5);
  assert.equal(
    finished.filter((p) => p.includes("personal-sessions")).length,
    2,
  );
});

test("MAS foreign or malformed sessions are never revoked", async () => {
  for (const resource of [
    { id: session, type: "user-session", attributes: { user_id: session } },
    { id: "../../escape", type: "user-session", attributes: { user_id: id } },
    { id: session, type: "personal-session", attributes: { user_id: id } },
  ]) {
    let posts = 0;
    const mock: typeof fetch = async (_input, init) => {
      if (init?.method === "POST") posts++;
      return Response.json({ data: [resource] });
    };
    await assert.rejects(
      new MasAdminClient(config, mock).finishSessions(id, "test"),
    );
    assert.equal(posts, 0);
  }
});

test("MAS account lookup verifies the immutable UUID localpart", async () => {
  const mock: typeof fetch = async () =>
    Response.json({
      data: {
        id,
        type: "user",
        attributes: { username: "foreign", locked_at: null },
      },
    });
  await assert.rejects(
    new MasAdminClient(config, mock).findUser(
      "10000000-0000-0000-0000-000000000001",
      "test",
    ),
    /identity mismatch/,
  );
});

test("MAS lock ownership retains PostgreSQL microseconds across response precision", async () => {
  const precise = "2026-10-06T20:43:25.123456789Z";
  const persisted = "2026-10-06T20:43:25.123456Z";
  const mock: typeof fetch = async (_url, init) =>
    Response.json({
      data: {
        id,
        type: "user",
        attributes: {
          username: "u_10000000000000000000000000000001",
          locked_at: init?.method === "POST" ? precise : persisted,
        },
      },
    });
  const client = new MasAdminClient(config, mock);
  assert.equal(
    await client.lockUser(id, "test"),
    (await client.findUser("10000000-0000-0000-0000-000000000001", "test"))
      ?.lockedAt,
  );
});
