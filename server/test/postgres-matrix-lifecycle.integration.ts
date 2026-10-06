import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { MatrixRoomBindingsAndRevocationOutbox20261006160000 } from "../src/database/migrations/20261006160000-MatrixRoomBindingsAndRevocationOutbox";
import { DataSource } from "typeorm";
import request from "supertest";
import {
  createTestApp,
  authenticateByCode,
} from "./support/auth-chat-test-harness";
import { MatrixRevocationWorker } from "../src/modules/matrix/matrix-revocation.worker";
import { SessionService } from "../src/modules/sessions/session.service";
import { SessionPrincipalType } from "../src/entities/auth-session.entity";
const url = process.env["E2EE_TEST_DATABASE_URL"];
if (!url) throw new Error("Isolated migrated PostgreSQL URL required");

test("Matrix lifecycle uses real PostgreSQL transactions and the existing plaintext fence", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "mm-matrix-lifecycle-"));
  const secret = join(temporary, "admin.secret");
  await writeFile(secret, randomBytes(32).toString("base64url"), {
    mode: 0o600,
  });
  const original = { ...process.env };
  Object.assign(process.env, {
    MATRIX_ENABLED: "true",
    MATRIX_ALLOW_INSECURE_LOCAL: "true",
    MATRIX_HOMESERVER_URL: "http://127.0.0.1:19998",
    MATRIX_ISSUER_URL: "http://127.0.0.1:19999",
    MATRIX_MAS_ADMIN_URL: "http://127.0.0.1:19997",
    MATRIX_SERVER_NAME: "staging.test",
    MATRIX_WEB_CLIENT_ID: "01K6Y0TP000000000000000002",
    MATRIX_MAS_CLIENT_ID: "01K6Y0TP000000000000000003",
    MATRIX_MAS_CLIENT_SECRET_FILE: secret,
  });
  const app = await createTestApp({
    postgresUrl: url,
    enableDemoAccounts: false,
    e2eeRequired: false,
  });
  t.after(async () => {
    await app.close();
    process.env = original;
    await rm(temporary, { recursive: true, force: true });
  });
  // Keep the remote service unavailable: local transactions must remain durable.
  await app.get(MatrixRevocationWorker).onModuleDestroy();
  const db = app.get(DataSource);
  const alice = await authenticateByCode(app, "+15550009701");
  const bob = await authenticateByCode(app, "+15550009702");
  const outsider = await authenticateByCode(app, "+15550009703");
  const client = request(app.getHttpServer());
  async function chat(participantIDs = [bob.userID]) {
    const r = await client
      .post("/api/chats")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ title: "Matrix migration", participantIDs })
      .expect(201);
    return r.body.id as string;
  }
  const chatID = await chat();
  const auth = { Authorization: `Bearer ${alice.token}` };
  await t.test("descriptor and binding require membership", async () => {
    await client
      .get(`/api/matrix/chats/${chatID}`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .expect(404);
    await client
      .post(`/api/matrix/chats/${chatID}`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ roomID: "!foreign:staging.test", epoch: 1 })
      .expect(404);
    const config = await client.get("/api/matrix/config").set(auth).expect(200);
    assert.equal(
      config.body.expectedUserID,
      `@u_${alice.userID.replaceAll("-", "")}:staging.test`,
    );
    assert.equal(config.headers["cache-control"], "no-store");
    assert.equal("adminSecret" in config.body, false);
  });
  await t.test(
    "wrong server and stale membership epoch cannot bind",
    async () => {
      await client
        .post(`/api/matrix/chats/${chatID}`)
        .set(auth)
        .send({ roomID: "!room:foreign.test", epoch: 1 })
        .expect(409);
      await client
        .post(`/api/matrix/chats/${chatID}`)
        .set(auth)
        .send({ roomID: "!room:staging.test", epoch: 2 })
        .expect(409);
      assert.equal(
        (
          await db.query("SELECT e2ee_required FROM chats WHERE id=$1", [
            chatID,
          ])
        )[0].e2ee_required,
        false,
      );
    },
  );
  await t.test(
    "concurrent room bindings have one immutable winner and disable plaintext",
    async () => {
      const results = await Promise.all(
        ["one", "two"].map((name) =>
          client
            .post(`/api/matrix/chats/${chatID}`)
            .set(auth)
            .send({ roomID: `!${name}:staging.test`, epoch: 1 }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const winning = results.find((r) => r.status === 201)!.body
        .roomID as string;
      await client
        .post(`/api/matrix/chats/${chatID}`)
        .set(auth)
        .send({ roomID: winning, epoch: 1 })
        .expect(201);
      await client
        .post(`/api/chats/${chatID}/messages`)
        .set(auth)
        .send({
          messageID: randomUUID(),
          kind: "text",
          text: "must not be stored",
        })
        .expect(403);
      await assert.rejects(
        db.query(
          "UPDATE matrix_lifecycle.chat_rooms SET room_id=$1 WHERE chat_id=$2",
          ["!replacement:staging.test", chatID],
        ),
        /immutable/,
      );
      await assert.rejects(
        db.query("UPDATE chats SET e2ee_required=false WHERE id=$1", [chatID]),
        /downgraded/,
      );
    },
  );
  await t.test(
    "room-version-12 IDs work and changed epochs cannot silently rebind",
    async () => {
      const id = await chat([bob.userID, outsider.userID]);
      const bound = await client
        .post(`/api/matrix/chats/${id}`)
        .set(auth)
        .send({ roomID: "!opaqueRoomVersion12", epoch: 1 })
        .expect(201);
      assert.equal(bound.body.boundEpoch, 1);
      await db.query("UPDATE chats SET encryption_epoch=2 WHERE id=$1", [id]);
      const descriptor = await client
        .get(`/api/matrix/chats/${id}`)
        .set(auth)
        .expect(200);
      assert.equal(descriptor.body.epoch, 2);
      assert.equal(descriptor.body.boundEpoch, 1);
      await client
        .post(`/api/matrix/chats/${id}`)
        .set(auth)
        .send({ roomID: "!opaqueRoomVersion12", epoch: 2 })
        .expect(409);
    },
  );
  await t.test(
    "rollback does not leak a revocation and committed generations remain pending",
    async () => {
      await assert.rejects(
        db.transaction(async (manager) => {
          await manager.query("UPDATE users SET status='blocked' WHERE id=$1", [
            bob.userID,
          ]);
          throw new Error("abort fixture");
        }),
        /abort fixture/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT * FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
            [bob.userID],
          )
        ).length,
        0,
      );
      await db.query(
        "UPDATE users SET session_version=session_version+1 WHERE id=$1",
        [bob.userID],
      );
      await db.query("UPDATE users SET status='blocked' WHERE id=$1", [
        bob.userID,
      ]);
      const row = (
        await db.query(
          "SELECT generation, completed_generation FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
          [bob.userID],
        )
      )[0];
      assert.equal(row.generation, "2");
      assert.equal(row.completed_generation, "0");
    },
  );
  await t.test(
    "unavailable MAS does not acknowledge revocation or resurrect Nest sessions",
    async () => {
      const service = app.get(SessionService);
      const claims = await service.verifyAccessToken(
        alice.token,
        SessionPrincipalType.USER,
      );
      await assert.rejects(
        service.revokeSession(
          SessionPrincipalType.USER,
          alice.userID,
          claims.sid,
          "fixture-logout",
        ),
        /revocation is pending/,
      );
      const row = (
        await db.query("SELECT revoked_at FROM auth_sessions WHERE id=$1", [
          claims.sid,
        ])
      )[0];
      assert.ok(row.revoked_at instanceof Date);
      assert.equal(
        (
          await db.query(
            "SELECT generation>completed_generation AS pending FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
            [alice.userID],
          )
        )[0].pending,
        true,
      );
    },
  );
  await t.test(
    "settled revocation does not allow fresh OTP during signed-token quarantine",
    async () => {
      await db.query(
        `UPDATE matrix_lifecycle.revocation_outbox SET completed_generation=generation,
      mas_lock_marker='2026-10-06T20:00:00.000000Z' WHERE principal_id=$1`,
        [alice.userID],
      );
      const fence = await app
        .get(MatrixRevocationWorker)
        .authenticationNotBefore(alice.userID);
      await assert.rejects(
        app.get(MatrixRevocationWorker).admitFreshLogin(alice.userID),
        /quarantined/,
      );
      await db.query(
        "UPDATE matrix_lifecycle.revocation_outbox SET quarantine_until=clock_timestamp()-interval '1 second' WHERE principal_id=$1",
        [alice.userID],
      );
      assert.equal(
        await app
          .get(MatrixRevocationWorker)
          .authenticationNotBefore(alice.userID),
        fence,
      );
    },
  );
  await t.test(
    "rollback refuses to discard immutable room bindings",
    async () => {
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        await assert.rejects(
          new MatrixRoomBindingsAndRevocationOutbox20261006160000().down(
            runner,
          ),
          /Cannot roll back/,
        );
      } finally {
        await runner.release();
      }
    },
  );

  for (const race of ["new-generation", "lost-lease"] as const) {
    await t.test(
      `worker completion preserves pending revocation after ${race}`,
      async () => {
        // Other fixtures are intentionally unavailable; isolate this worker job.
        await db.query(
          "UPDATE matrix_lifecycle.revocation_outbox SET next_attempt_at=clock_timestamp()+interval '1 hour'",
        );
        await db.query(
          "UPDATE users SET session_version=session_version+1 WHERE id=$1",
          [outsider.userID],
        );
        const initial = (
          await db.query(
            "SELECT generation FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
            [outsider.userID],
          )
        )[0].generation;
        let reached!: () => void;
        const didReach = new Promise<void>((resolve) => {
          reached = resolve;
        });
        let resume!: () => void;
        const gate = new Promise<void>((resolve) => {
          resume = resolve;
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
          const path = new URL(String(input)).pathname;
          if (path === "/oauth2/token")
            return Response.json({
              access_token: "synthetic-worker-token",
              token_type: "Bearer",
              scope: "urn:mas:admin",
            });
          const attributes = {
            username: `u_${outsider.userID.replaceAll("-", "")}`,
            locked_at: null as string | null,
          };
          if (path.endsWith("/lock")) {
            reached();
            await gate;
            attributes.locked_at = "2026-10-06T20:00:00.123456Z";
            return Response.json({
              data: {
                id: "01K6Y0TP000000000000000004",
                type: "user",
                attributes,
              },
            });
          }
          assert.equal(init?.method, "GET");
          if (path.includes("/by-username/"))
            return Response.json({
              data: {
                id: "01K6Y0TP000000000000000004",
                type: "user",
                attributes,
              },
            });
          return Response.json({ data: [] });
        };
        const worker = new MatrixRevocationWorker(db);
        const draining = worker.drain();
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            didReach,
            new Promise<never>((_resolve, reject) => {
              deadline = setTimeout(
                () => reject(new Error("Worker did not reach remote lock")),
                5000,
              );
            }),
          ]);
          if (race === "new-generation")
            await db.query(
              "UPDATE users SET session_version=session_version+1 WHERE id=$1",
              [outsider.userID],
            );
          else
            await db.query(
              "UPDATE matrix_lifecycle.revocation_outbox SET lease_id=$1, lease_until=clock_timestamp()+interval '30 seconds' WHERE principal_id=$2",
              [randomUUID(), outsider.userID],
            );
          resume();
          await draining;
          const row = (
            await db.query(
              "SELECT generation,completed_generation FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
              [outsider.userID],
            )
          )[0];
          assert.ok(BigInt(row.generation) > BigInt(row.completed_generation));
          assert.equal(
            row.completed_generation,
            race === "new-generation" ? initial : "0",
          );
        } finally {
          clearTimeout(deadline);
          resume();
          await draining;
          globalThis.fetch = originalFetch;
          await worker.onModuleDestroy();
          await db.query(
            "DELETE FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
            [outsider.userID],
          );
        }
      },
    );
  }
});
