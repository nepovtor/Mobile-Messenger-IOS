import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import request from "supertest";
import { DataSource } from "typeorm";
import {
  authenticateByCode,
  createTestApp,
  openRealtimeSocket,
  sendRealtimeEvent,
} from "./support/auth-chat-test-harness";
import { ChatEntity } from "../src/entities/chat.entity";
import { MessageEntity } from "../src/entities/message.entity";

const url = process.env["E2EE_TEST_DATABASE_URL"];
if (!url) {
  throw new Error(
    "E2EE_TEST_DATABASE_URL must refer to an isolated migrated PostgreSQL database",
  );
}

async function connection(): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

async function waitUntilBlocked(
  observer: Client,
  blockerPID: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity AS a
         WHERE a.pid <> pg_backend_pid()
           AND $1::int = ANY(pg_blocking_pids(a.pid))
       ) AS blocked`,
      [blockerPID],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No query blocked by PostgreSQL backend ${blockerPID}`);
}

async function pid(client: Client): Promise<number> {
  const result = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  return result.rows[0]!.pid;
}

test("PostgreSQL serializes legacy mutations with chat E2EE activation", async (t) => {
  const app = await createTestApp({
    postgresUrl: url,
    enableDemoAccounts: false,
  });
  t.after(async () => app.close());
  const observer = await connection();
  t.after(async () => observer.end());
  const alice = await authenticateByCode(app, "+15550009501");
  const bob = await authenticateByCode(app, "+15550009502");
  const charlie = await authenticateByCode(app, "+15550009503");
  const database = app.get(DataSource);

  async function createChat(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/chats")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        title: `Race ${randomUUID()}`,
        participantIDs: [bob.userID, charlie.userID],
      })
      .expect(201);
    return response.body.id as string;
  }
  function send(chatID: string, text: string) {
    return request(app.getHttpServer())
      .post(`/api/chats/${chatID}/messages`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ messageID: randomUUID(), kind: "text", text });
  }
  async function enable(chatID: string): Promise<void> {
    await database
      .getRepository(ChatEntity)
      .update(chatID, { e2eeRequired: true });
  }

  await t.test("plaintext succeeds before policy activation", async () => {
    const chatID = await createChat();
    const response = await send(chatID, "allowed").expect(201);
    const stored = await database
      .getRepository(MessageEntity)
      .findOneBy({ id: response.body.id });
    assert.equal(stored?.text, "allowed");
  });

  await t.test(
    "REST create, edit, delete and read receipt reject protected chat",
    async () => {
      const chatID = await createChat();
      const prior = await send(chatID, "before policy").expect(201);
      await enable(chatID);
      await send(chatID, "after policy").expect(403);
      await request(app.getHttpServer())
        .patch(`/api/chats/${chatID}/messages/${prior.body.id as string}`)
        .set("Authorization", `Bearer ${alice.token}`)
        .send({ text: "edit after policy" })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/chats/${chatID}/messages/${prior.body.id as string}`)
        .set("Authorization", `Bearer ${alice.token}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/chats/${chatID}/messages/${prior.body.id as string}/read`)
        .set("Authorization", `Bearer ${bob.token}`)
        .expect(403);
      const stored = await database
        .getRepository(MessageEntity)
        .findOneBy({ id: prior.body.id });
      assert.equal(stored?.text, "before policy");
      assert.equal(stored?.deletedAt, null);
    },
  );

  for (const mutation of ["create", "edit", "delete"] as const) {
    await t.test(`policy commits before waiting ${mutation}`, async () => {
      const chatID = await createChat();
      const previous =
        mutation === "create"
          ? null
          : await send(chatID, "original").expect(201);
      const policy = await connection();
      try {
        await policy.query("BEGIN");
        await policy.query(
          "UPDATE chats SET e2ee_required = true WHERE id = $1",
          [chatID],
        );
        const policyPID = await pid(policy);
        const pending =
          mutation === "create"
            ? send(chatID, "late").then((response) => response)
            : mutation === "edit"
              ? request(app.getHttpServer())
                  .patch(
                    `/api/chats/${chatID}/messages/${previous!.body.id as string}`,
                  )
                  .set("Authorization", `Bearer ${alice.token}`)
                  .send({ text: "late edit" })
                  .then((response) => response)
              : request(app.getHttpServer())
                  .delete(
                    `/api/chats/${chatID}/messages/${previous!.body.id as string}`,
                  )
                  .set("Authorization", `Bearer ${alice.token}`)
                  .then((response) => response);
        await waitUntilBlocked(observer, policyPID);
        await policy.query("COMMIT");
        const response = await pending;
        assert.equal(response.status, 403);
        const rows = await database
          .getRepository(MessageEntity)
          .findBy({ chatId: chatID });
        assert.equal(rows.length, previous ? 1 : 0);
        if (previous) {
          assert.equal(rows[0]?.text, "original");
          assert.equal(rows[0]?.deletedAt, null);
        }
      } finally {
        await policy.query("ROLLBACK");
        await policy.end();
      }
    });
  }

  for (const mutation of ["create", "edit", "delete"] as const) {
    await t.test(
      `older ${mutation} commits before waiting activation`,
      async () => {
        const chatID = await createChat();
        const previous =
          mutation === "create"
            ? null
            : await send(chatID, "original").expect(201);
        const writer = await connection();
        const policy = await connection();
        try {
          await writer.query("BEGIN");
          await writer.query("SELECT id FROM chats WHERE id = $1 FOR UPDATE", [
            chatID,
          ]);
          const messageID =
            mutation === "create"
              ? randomUUID()
              : (previous!.body.id as string);
          if (mutation === "create") {
            await writer.query(
              `INSERT INTO messages(id, chat_id, author_id, client_message_id, kind, text, status)
             VALUES ($1, $2, $3, $1, 'text', 'committed first', 'sent')`,
              [messageID, chatID, alice.userID],
            );
          } else if (mutation === "edit") {
            await writer.query(
              "UPDATE messages SET text = 'committed first' WHERE id = $1",
              [messageID],
            );
          } else {
            await writer.query(
              "UPDATE messages SET text = 'Сообщение удалено', deleted_at = now() WHERE id = $1",
              [messageID],
            );
          }
          const writerPID = await pid(writer);
          const activation = policy.query(
            "UPDATE chats SET e2ee_required = true WHERE id = $1",
            [chatID],
          );
          await waitUntilBlocked(observer, writerPID);
          await writer.query("COMMIT");
          await activation;
          const stored = await database
            .getRepository(MessageEntity)
            .findOneBy({ id: messageID });
          assert.equal(
            stored?.text,
            mutation === "delete" ? "Сообщение удалено" : "committed first",
          );
          assert.equal(stored?.deletedAt != null, mutation === "delete");
          await send(chatID, "too late").expect(403);
        } finally {
          await writer.query("ROLLBACK");
          await writer.end();
          await policy.end();
        }
      },
    );
  }

  await t.test("WebSocket shares the locked mutation path", async () => {
    const chatID = await createChat();
    const client = await openRealtimeSocket(app, alice.token);
    t.after(() => client.socket.close());
    const policy = await connection();
    try {
      await policy.query("BEGIN");
      await policy.query(
        "UPDATE chats SET e2ee_required = true WHERE id = $1",
        [chatID],
      );
      const policyPID = await pid(policy);
      const clientMessageId = randomUUID();
      sendRealtimeEvent(client.socket, "message.send", {
        chatID,
        clientMessageId,
        kind: "text",
        text: "socket late",
      });
      await waitUntilBlocked(observer, policyPID);
      await policy.query("COMMIT");
      const failed = await client.nextEvent<{ clientMessageId: string }>(
        "message.failed",
      );
      assert.equal(failed.data.clientMessageId, clientMessageId);
      assert.equal(
        await database.getRepository(MessageEntity).countBy({ chatId: chatID }),
        0,
      );
    } finally {
      await policy.query("ROLLBACK");
      await policy.end();
    }
  });

  await t.test(
    "database trigger prevents direct writes and downgrade; failed transactions roll back",
    async () => {
      const chatID = await createChat();
      await enable(chatID);
      const direct = await connection();
      try {
        await direct.query("BEGIN");
        await assert.rejects(
          direct.query(
            `INSERT INTO messages(id, chat_id, author_id, client_message_id, kind, text, status)
           VALUES ($1, $2, $3, $1, 'text', 'bypass', 'sent')`,
            [randomUUID(), chatID, alice.userID],
          ),
          { code: "23514" },
        );
        await direct.query("ROLLBACK");
        assert.equal(
          await database
            .getRepository(MessageEntity)
            .countBy({ chatId: chatID }),
          0,
        );
        await assert.rejects(
          direct.query("UPDATE chats SET e2ee_required = false WHERE id = $1", [
            chatID,
          ]),
          { code: "23514" },
        );
        const chat = await database
          .getRepository(ChatEntity)
          .findOneByOrFail({ id: chatID });
        assert.equal(chat.e2eeRequired, true);
      } finally {
        await direct.query("ROLLBACK");
        await direct.end();
      }
    },
  );
  await t.test("database trigger rejects direct edit and delete", async () => {
    const chatID = await createChat();
    const previous = await send(chatID, "original").expect(201);
    const messageID = previous.body.id as string;
    await enable(chatID);
    const direct = await connection();
    try {
      await assert.rejects(
        direct.query("UPDATE messages SET text = 'bypass' WHERE id = $1", [
          messageID,
        ]),
        { code: "23514" },
      );
      await assert.rejects(
        direct.query("DELETE FROM messages WHERE id = $1", [messageID]),
        { code: "23514" },
      );
      const stored = await database
        .getRepository(MessageEntity)
        .findOneByOrFail({ id: messageID });
      assert.equal(stored.text, "original");
    } finally {
      await direct.end();
    }
  });
  await t.test(
    "database failure rolls back REST mutation and metadata",
    async () => {
      const chatID = await createChat();
      const before = await database
        .getRepository(ChatEntity)
        .findOneByOrFail({ id: chatID });
      await database.query(`
      CREATE FUNCTION test_reject_legacy_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'test forced database failure' USING ERRCODE = '23514';
      END; $$
    `);
      await database.query(`
      CREATE TRIGGER zz_test_reject_legacy_insert
      AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION test_reject_legacy_insert()
    `);
      try {
        const failed = await send(chatID, "rolled back").expect(500);
        assert.equal(failed.body.message, "Message operation failed");
        assert.equal(
          JSON.stringify(failed.body).includes("rolled back"),
          false,
        );
        assert.equal(
          await database
            .getRepository(MessageEntity)
            .countBy({ chatId: chatID }),
          0,
        );
        const after = await database
          .getRepository(ChatEntity)
          .findOneByOrFail({ id: chatID });
        assert.equal(after.lastMessageId, before.lastMessageId);
      } finally {
        await database.query(
          "DROP TRIGGER zz_test_reject_legacy_insert ON messages",
        );
        await database.query("DROP FUNCTION test_reject_legacy_insert()");
      }
    },
  );

  await t.test("nonparticipant cannot mutate a chat", async () => {
    const chatID = await createChat();
    const stranger = await authenticateByCode(app, "+15550009504");
    await request(app.getHttpServer())
      .post(`/api/chats/${chatID}/messages`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ messageID: randomUUID(), kind: "text", text: "unauthorized" })
      .expect(404);
    assert.equal(
      await database.getRepository(MessageEntity).countBy({ chatId: chatID }),
      0,
    );
  });
});
