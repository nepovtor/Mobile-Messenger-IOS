import pg from "pg";
import { readFileSync } from "node:fs";
import { migrate } from "./adapter.mjs";
async function main() {
  const connectionString = readFileSync(
    process.env.OIDC_DATABASE_URL_FILE,
    "utf8",
  ).trim();
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "OIDC schema migration failed; check configuration and database access",
  );
  process.exitCode = 1;
});
