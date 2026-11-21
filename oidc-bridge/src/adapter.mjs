import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { errors } from "oidc-provider";

const digest = (value) =>
  value == null ? null : createHash("sha256").update(value).digest("hex");

export async function migrate(pool) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('mobile_messenger_oidc_schema', 0))",
    );
    await connection.query(`
    CREATE SCHEMA IF NOT EXISTS oidc_bridge;
    REVOKE ALL ON SCHEMA oidc_bridge FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS oidc_bridge.artifacts (
      model text NOT NULL, id_hash text NOT NULL, payload bytea NOT NULL,
      expires_at timestamptz NOT NULL, consumed bigint,
      grant_hash text, uid_hash text, user_code_hash text,
      PRIMARY KEY (model, id_hash)
    );
    REVOKE ALL ON oidc_bridge.artifacts FROM PUBLIC;
    CREATE INDEX IF NOT EXISTS oidc_artifacts_expiry ON oidc_bridge.artifacts (expires_at);
    CREATE INDEX IF NOT EXISTS oidc_artifacts_grant ON oidc_bridge.artifacts (grant_hash) WHERE grant_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS oidc_artifacts_uid ON oidc_bridge.artifacts (model, uid_hash) WHERE uid_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS oidc_artifacts_user_code ON oidc_bridge.artifacts (model, user_code_hash) WHERE user_code_hash IS NOT NULL;
    CREATE TABLE IF NOT EXISTS oidc_bridge.rate_limits (
      bucket_hash text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
    );
    REVOKE ALL ON oidc_bridge.rate_limits FROM PUBLIC;
    CREATE INDEX IF NOT EXISTS oidc_rate_limits_expiry ON oidc_bridge.rate_limits (expires_at);
    `);
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

export function createAdapter(pool, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("Invalid storage key");
  return class PostgresAdapter {
    constructor(model) {
      this.model = model;
    }
    encode(idHash, payload) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(`${this.model}\0${idHash}`));
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(payload), "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    }
    decode(row) {
      if (!row) return undefined;
      const bytes = row.payload;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(`${this.model}\0${row.id_hash}`));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const payload = JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      );
      if (
        digest(payload.uid) !== row.uid_hash ||
        digest(payload.userCode) !== row.user_code_hash ||
        digest(payload.grantId) !== row.grant_hash
      ) {
        throw new Error("Artifact index does not match authenticated payload");
      }
      if (row.consumed != null) payload.consumed = Number(row.consumed);
      return payload;
    }
    async upsert(id, payload, expiresIn) {
      if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86400)
        throw new Error("Artifact lifetime outside policy");
      const idHash = digest(id);
      await pool.query(
        `INSERT INTO oidc_bridge.artifacts
        (model,id_hash,payload,expires_at,grant_hash,uid_hash,user_code_hash)
        VALUES ($1,$2,$3,clock_timestamp()+$4*interval '1 second',$5,$6,$7)
        ON CONFLICT (model,id_hash) DO UPDATE SET payload=EXCLUDED.payload,
          expires_at=EXCLUDED.expires_at, grant_hash=EXCLUDED.grant_hash,
          uid_hash=EXCLUDED.uid_hash, user_code_hash=EXCLUDED.user_code_hash`,
        [
          this.model,
          idHash,
          this.encode(idHash, payload),
          expiresIn,
          digest(payload.grantId),
          digest(payload.uid),
          digest(payload.userCode),
        ],
      );
    }
    async find(id) {
      return this.lookup("id_hash", id);
    }
    async findByUid(uid) {
      return this.lookup("uid_hash", uid);
    }
    async findByUserCode(userCode) {
      return this.lookup("user_code_hash", userCode);
    }
    async lookup(column, value) {
      const result = await pool.query(
        `SELECT * FROM oidc_bridge.artifacts WHERE model=$1 AND ${column}=$2 AND expires_at>clock_timestamp()`,
        [this.model, digest(value)],
      );
      return this.decode(result.rows[0]);
    }
    async consume(id) {
      const result = await pool.query(
        `UPDATE oidc_bridge.artifacts
        SET consumed=floor(extract(epoch FROM clock_timestamp()))
        WHERE model=$1 AND id_hash=$2 AND consumed IS NULL AND expires_at>clock_timestamp() RETURNING id_hash`,
        [this.model, digest(id)],
      );
      if (result.rowCount !== 1)
        throw new errors.InvalidGrant("Artifact expired or already consumed");
    }
    async destroy(id) {
      await pool.query(
        "DELETE FROM oidc_bridge.artifacts WHERE model=$1 AND id_hash=$2",
        [this.model, digest(id)],
      );
    }
    async revokeByGrantId(id) {
      await pool.query(
        "DELETE FROM oidc_bridge.artifacts WHERE grant_hash=$1",
        [digest(id)],
      );
    }
  };
}

export async function pruneExpired(pool) {
  await pool.query(
    "DELETE FROM oidc_bridge.artifacts WHERE expires_at<=clock_timestamp()",
  );
  await pool.query(
    "DELETE FROM oidc_bridge.rate_limits WHERE expires_at<=clock_timestamp()",
  );
}

export async function consumeRateLimit(pool, key, address, maximum = 120) {
  const bucket = createHmac("sha256", key)
    .update(`oidc-rate-limit\0${address}`)
    .digest("hex");
  const result = await pool.query(
    `INSERT INTO oidc_bridge.rate_limits (bucket_hash,hits,expires_at)
    VALUES ($1,1,clock_timestamp()+interval '60 seconds')
    ON CONFLICT (bucket_hash) DO UPDATE SET
      hits=CASE WHEN oidc_bridge.rate_limits.expires_at<=clock_timestamp() THEN 1 ELSE oidc_bridge.rate_limits.hits+1 END,
      expires_at=CASE WHEN oidc_bridge.rate_limits.expires_at<=clock_timestamp() THEN clock_timestamp()+interval '60 seconds' ELSE oidc_bridge.rate_limits.expires_at END
    RETURNING hits`,
    [bucket],
  );
  return result.rows[0].hits <= maximum;
}
