import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as matrix from "matrix-js-sdk";

const homeserver =
  process.env.MATRIX_SMOKE_HOMESERVER ?? "http://127.0.0.1:18008";
const url = new URL(homeserver);
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
if (!alicePasswordFile || !bobPasswordFile) {
  throw new Error("Set both MATRIX_SMOKE_*_PASSWORD_FILE variables");
}

let alice;
let bob;
async function withTimeout(promise, label, milliseconds = 30_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSync(client, label) {
  const prepared = new Promise((resolve, reject) => {
    client.on(matrix.ClientEvent.Sync, (state) => {
      if (state === "PREPARED") resolve();
      if (state === "ERROR") reject(new Error(`${label} sync failed`));
    });
  });
  await withTimeout(prepared, `${label} sync`);
}

try {
  const aliceLogin = await matrix
    .createClient({ baseUrl: url.origin })
    .loginWithPassword(
      "alice",
      (await readFile(alicePasswordFile, "utf8")).trim(),
    );
  const bobLogin = await matrix
    .createClient({ baseUrl: url.origin })
    .loginWithPassword("bob", (await readFile(bobPasswordFile, "utf8")).trim());
  alice = matrix.createClient({
    baseUrl: url.origin,
    accessToken: aliceLogin.access_token,
    userId: aliceLogin.user_id,
    deviceId: aliceLogin.device_id,
  });
  bob = matrix.createClient({
    baseUrl: url.origin,
    accessToken: bobLogin.access_token,
    userId: bobLogin.user_id,
    deviceId: bobLogin.device_id,
  });
  await Promise.all([
    alice.initRustCrypto({ useIndexedDB: false }),
    bob.initRustCrypto({ useIndexedDB: false }),
  ]);

  const aliceSync = waitForSync(alice, "Alice");
  const bobSync = waitForSync(bob, "Bob");
  await Promise.all([alice.startClient(), bob.startClient()]);
  await Promise.all([aliceSync, bobSync]);

  const room = await alice.createRoom({
    preset: "private_chat",
    invite: ["@bob:localhost"],
    initial_state: [
      {
        type: "m.room.encryption",
        state_key: "",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      },
    ],
  });
  await bob.joinRoom(room.room_id);
  if (!(await alice.getCrypto().isEncryptionEnabledInRoom(room.room_id))) {
    throw new Error("Sender room is not encrypted");
  }

  const testBody = `matrix-smoke-${randomUUID()}`;
  const received = new Promise((resolve) => {
    bob.on(matrix.ClientEvent.Event, (event) => {
      if (event.getRoomId() !== room.room_id) return;
      const check = () => {
        if (
          event.getType() === "m.room.message" &&
          event.getContent().body === testBody
        )
          resolve(event);
      };
      event.on("Event.decrypted", check);
      check();
    });
  });
  await alice.sendTextMessage(room.room_id, testBody);
  const event = await withTimeout(received, "encrypted message");
  if (!event.isEncrypted()) {
    throw new Error(
      "Received message did not originate as an encrypted Matrix event",
    );
  }
  console.log(
    "Matrix Web encrypted room roundtrip passed on isolated loopback Synapse.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  alice?.stopClient();
  bob?.stopClient();
}
// The SDK keeps retry/background timers alive after stopClient in Node.js.
process.exit(process.exitCode ?? 0);
