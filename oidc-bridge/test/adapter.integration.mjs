import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  createAdapter,
  migrate,
  pruneExpired,
  consumeRateLimit,
} from "../src/adapter.mjs";

const databaseURL = process.env.OIDC_TEST_DATABASE_URL;
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("encrypted OIDC PostgreSQL adapter security invariants", async (t) => {
  assert.ok(
    databaseURL,
    "OIDC_TEST_DATABASE_URL must point to a disposable PostgreSQL database",
  );
  const pool = new pg.Pool({ connectionString: databaseURL, max: 12 });
  const key = randomBytes(32);
  const Adapter = createAdapter(pool, key);
  const namespace = `AdapterTest-${randomUUID()}`;
  const models = [
    `${namespace}-Code`,
    `${namespace}-Session`,
    `${namespace}-Token`,
  ];
  const codes = new Adapter(models[0]);
  const sessions = new Adapter(models[1]);
  const tokens = new Adapter(models[2]);
  let migrated = false;
  t.after(async () => {
    try {
      if (migrated)
        await pool.query(
          "DELETE FROM oidc_bridge.artifacts WHERE model=ANY($1)",
          [models],
        );
    } finally {
      await pool.end();
    }
  });
  await migrate(pool);
  migrated = true;

  await t.test(
    "encrypts payloads and stores only hashed identifiers, surviving process replacement",
    async () => {
      const id = randomUUID();
      const payload = {
        accountId: randomUUID(),
        clientId: "private-client",
        grantId: randomUUID(),
        uid: randomUUID(),
        userCode: randomUUID(),
        privateMarker: `plaintext-must-not-appear-${randomUUID()}`,
      };
      await codes.upsert(id, payload, 300);
      assert.deepEqual(await codes.find(id), payload);
      assert.deepEqual(await codes.findByUid(payload.uid), payload);
      assert.deepEqual(await codes.findByUserCode(payload.userCode), payload);
      const row = (
        await pool.query(
          "SELECT * FROM oidc_bridge.artifacts WHERE model=$1 AND id_hash=$2",
          [models[0], digest(id)],
        )
      ).rows[0];
      assert.equal(row.id_hash, digest(id));
      assert.equal(row.grant_hash, digest(payload.grantId));
      assert.equal(row.uid_hash, digest(payload.uid));
      assert.equal(row.user_code_hash, digest(payload.userCode));
      for (const value of [id, ...Object.values(payload)]) {
        assert.equal(row.payload.includes(Buffer.from(value)), false);
      }
      const AfterRestart = createAdapter(pool, Buffer.from(key));
      assert.deepEqual(await new AfterRestart(models[0]).find(id), payload);
      const WrongKey = createAdapter(pool, randomBytes(32));
      await assert.rejects(new WrongKey(models[0]).find(id));

      await codes.upsert(id, payload, 300);
      const replacement = (
        await pool.query(
          "SELECT payload FROM oidc_bridge.artifacts WHERE model=$1 AND id_hash=$2",
          [models[0], digest(id)],
        )
      ).rows[0];
      assert.notDeepEqual(
        replacement.payload,
        row.payload,
        "upsert must generate a fresh GCM nonce",
      );
    },
  );

  await t.test(
    "only one of 24 simultaneous authorization-code consumes succeeds",
    async () => {
      const id = randomUUID();
      const payload = { accountId: randomUUID(), grantId: randomUUID() };
      await codes.upsert(id, payload, 300);
      // All callers can load an unconsumed code before any of them reaches the
      // adapter. Correctness must come from PostgreSQL's conditional UPDATE.
      const snapshots = await Promise.all(
        Array.from({ length: 24 }, () => codes.find(id)),
      );
      assert.ok(snapshots.every((snapshot) => snapshot.consumed === undefined));
      const results = await Promise.allSettled(
        Array.from({ length: 24 }, () => codes.consume(id)),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const failures = results.filter((result) => result.status === "rejected");
      assert.equal(failures.length, 23);
      assert.ok(
        failures.every((result) => result.reason.error === "invalid_grant"),
      );
      const consumed = await codes.find(id);
      assert.ok(Number.isInteger(consumed.consumed));
      assert.ok(consumed.consumed > 0);
      await assert.rejects(
        codes.consume(id),
        (error) => error.error === "invalid_grant",
      );

      // A delayed save from another request must not clear the consumption bit.
      await codes.upsert(id, payload, 300);
      assert.equal((await codes.find(id)).consumed, consumed.consumed);
      await assert.rejects(
        codes.consume(id),
        (error) => error.error === "invalid_grant",
      );
    },
  );

  await t.test(
    "GCM rejects ciphertext modifications and cross-ID or cross-model transplantation",
    async () => {
      const first = randomUUID();
      const second = randomUUID();
      await codes.upsert(first, { accountId: "first" }, 300);
      await codes.upsert(second, { accountId: "second" }, 300);
      await sessions.upsert(first, { accountId: "session" }, 300);
      const ciphertext = (
        await pool.query(
          "SELECT payload FROM oidc_bridge.artifacts WHERE model=$1 AND id_hash=$2",
          [models[0], digest(first)],
        )
      ).rows[0].payload;
      await pool.query(
        "UPDATE oidc_bridge.artifacts SET payload=$1 WHERE model=$2 AND id_hash=$3",
        [ciphertext, models[0], digest(second)],
      );
      await assert.rejects(codes.find(second));
      await pool.query(
        "UPDATE oidc_bridge.artifacts SET payload=$1 WHERE model=$2 AND id_hash=$3",
        [ciphertext, models[1], digest(first)],
      );
      await assert.rejects(sessions.find(first));
      const changed = Buffer.from(ciphertext);
      changed[changed.length - 1] ^= 1;
      await pool.query(
        "UPDATE oidc_bridge.artifacts SET payload=$1 WHERE model=$2 AND id_hash=$3",
        [changed, models[0], digest(first)],
      );
      await assert.rejects(codes.find(first));
    },
  );

  await t.test(
    "forged lookup indexes cannot select a different authenticated identity",
    async () => {
      for (const column of ["uid_hash", "user_code_hash", "grant_hash"]) {
        const id = randomUUID();
        const forged = randomUUID();
        await sessions.upsert(
          id,
          {
            accountId: randomUUID(),
            uid: randomUUID(),
            userCode: randomUUID(),
            grantId: randomUUID(),
          },
          300,
        );
        await pool.query(
          `UPDATE oidc_bridge.artifacts SET ${column}=$1 WHERE model=$2 AND id_hash=$3`,
          [digest(forged), models[1], digest(id)],
        );
        await assert.rejects(sessions.find(id), /index does not match/);
        if (column === "uid_hash")
          await assert.rejects(
            sessions.findByUid(forged),
            /index does not match/,
          );
        if (column === "user_code_hash")
          await assert.rejects(
            sessions.findByUserCode(forged),
            /index does not match/,
          );
      }
    },
  );

  await t.test(
    "expired artifacts cannot be loaded or consumed and are pruned",
    async () => {
      for (const lifetime of [0, -1, 86401, NaN, Infinity]) {
        await assert.rejects(codes.upsert(randomUUID(), {}, lifetime));
      }
      const id = randomUUID();
      const uid = randomUUID();
      const userCode = randomUUID();
      const survivor = randomUUID();
      await codes.upsert(id, { uid, userCode }, 300);
      await codes.upsert(survivor, { alive: true }, 300);
      await pool.query(
        "UPDATE oidc_bridge.artifacts SET expires_at=clock_timestamp()-interval '1 second' WHERE model=$1 AND id_hash=$2",
        [models[0], digest(id)],
      );
      assert.equal(await codes.find(id), undefined);
      assert.equal(await codes.findByUid(uid), undefined);
      assert.equal(await codes.findByUserCode(userCode), undefined);
      await assert.rejects(
        codes.consume(id),
        (error) => error.error === "invalid_grant",
      );
      await pruneExpired(pool);
      assert.equal(
        (
          await pool.query(
            "SELECT id_hash FROM oidc_bridge.artifacts WHERE model=$1 AND id_hash=$2",
            [models[0], digest(id)],
          )
        ).rowCount,
        0,
      );
      assert.deepEqual(await codes.find(survivor), { alive: true });
    },
  );

  await t.test(
    "grant revocation removes related artifacts across models and keeps unrelated grants",
    async () => {
      const grantId = randomUUID();
      const codeId = randomUUID();
      const tokenId = randomUUID();
      const survivor = randomUUID();
      await codes.upsert(codeId, { grantId }, 300);
      await tokens.upsert(tokenId, { grantId }, 300);
      await tokens.upsert(survivor, { grantId: randomUUID() }, 300);
      await codes.revokeByGrantId(grantId);
      assert.equal(await codes.find(codeId), undefined);
      assert.equal(await tokens.find(tokenId), undefined);
      assert.ok(await tokens.find(survivor));
      await tokens.destroy(survivor);
      assert.equal(await tokens.find(survivor), undefined);
    },
  );

  await t.test(
    "private schema/table deny PUBLIC and lookup indexes exist",
    async () => {
      const schemaACL = (
        await pool.query(
          "SELECT nspacl::text AS acl FROM pg_namespace WHERE nspname='oidc_bridge'",
        )
      ).rows[0].acl;
      const tableACL = (
        await pool.query(
          "SELECT relacl::text AS acl FROM pg_class WHERE oid='oidc_bridge.artifacts'::regclass",
        )
      ).rows[0].acl;
      assert.doesNotMatch(schemaACL, /(?:^|[,{])=/);
      assert.doesNotMatch(tableACL, /(?:^|[,{])=/);
      const indexes = (
        await pool.query(
          "SELECT indexdef FROM pg_indexes WHERE schemaname='oidc_bridge' AND tablename='artifacts'",
        )
      ).rows.map((row) => row.indexdef);
      assert.ok(
        indexes.some((definition) => definition.includes("(expires_at)")),
      );
      assert.ok(
        indexes.some((definition) => definition.includes("(grant_hash)")),
      );
      assert.ok(
        indexes.some(
          (definition) =>
            definition.includes("UNIQUE") &&
            definition.includes("(model, uid_hash)"),
        ),
      );
      assert.ok(
        indexes.some(
          (definition) =>
            definition.includes("UNIQUE") &&
            definition.includes("(model, user_code_hash)"),
        ),
      );
    },
  );
  await t.test(
    "durable rate limit is atomic across simultaneous requests",
    async () => {
      const address = `test-${randomUUID()}`;
      const allowed = await Promise.all(
        Array.from({ length: 24 }, () =>
          consumeRateLimit(pool, key, address, 8),
        ),
      );
      assert.equal(allowed.filter(Boolean).length, 8);
      assert.equal(await consumeRateLimit(pool, key, address, 8), false);
      const rows = await pool.query(
        "SELECT bucket_hash,hits FROM oidc_bridge.rate_limits WHERE hits=25",
      );
      assert.ok(rows.rowCount > 0);
      assert.ok(rows.rows.every((row) => !row.bucket_hash.includes(address)));
    },
  );
});
