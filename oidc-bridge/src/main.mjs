import pg from "pg";
import { loadConfig } from "./config.mjs";
import { createBridge } from "./provider.mjs";
import { pruneExpired } from "./adapter.mjs";

async function main() {
  const config = loadConfig();
  const pool = new pg.Pool({
    connectionString: config.databaseURL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    // Schema creation is an explicit migration step, never an implicit startup action.
    await pool.query("SELECT 1 FROM oidc_bridge.artifacts LIMIT 1");
    const app = await createBridge({ config, pool });
    app.server.listen(config.port, config.host, () =>
      console.log("OTP OIDC bridge started"),
    );
    const cleanup = setInterval(
      () =>
        pruneExpired(pool).catch(() =>
          console.error("OIDC storage cleanup failed"),
        ),
      60000,
    );
    cleanup.unref();
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, async () => {
        clearInterval(cleanup);
        await app.close();
        await pool.end();
      });
  } catch (error) {
    await pool.end();
    throw error;
  }
}
main().catch(() => {
  console.error(
    "OIDC bridge startup failed; check configuration and database access",
  );
  process.exitCode = 1;
});
