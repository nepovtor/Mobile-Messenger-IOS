import { readFile } from "node:fs/promises";
import * as matrix from "matrix-js-sdk";
import { assertEncryptedRoundtrip } from "./matrix-encrypted-roundtrip.mjs";

const url = new URL(
  process.env.MATRIX_SMOKE_HOMESERVER ?? "http://127.0.0.1:18008",
);
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(url.hostname)
) {
  throw new Error(
    "Matrix smoke test is restricted to an HTTP loopback homeserver",
  );
}
const alicePasswordFile = process.env.MATRIX_SMOKE_ALICE_PASSWORD_FILE;
const bobPasswordFile = process.env.MATRIX_SMOKE_BOB_PASSWORD_FILE;
if (!alicePasswordFile || !bobPasswordFile)
  throw new Error("Set both MATRIX_SMOKE_*_PASSWORD_FILE variables");
try {
  const alice = await matrix
    .createClient({ baseUrl: url.origin })
    .loginWithPassword(
      "alice",
      (await readFile(alicePasswordFile, "utf8")).trim(),
    );
  const bob = await matrix
    .createClient({ baseUrl: url.origin })
    .loginWithPassword("bob", (await readFile(bobPasswordFile, "utf8")).trim());
  await assertEncryptedRoundtrip(url.origin, alice, bob);
  console.log(
    "Matrix Web encrypted room roundtrip passed on isolated loopback Synapse.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
// The SDK can retain retry timers after stopClient in Node.js.
process.exit(process.exitCode ?? 0);
