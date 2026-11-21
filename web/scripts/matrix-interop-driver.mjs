// Self-check for the disposable fixture. This is not the Swift/iOS acceptance run.
import { readFile } from "node:fs/promises";
import * as matrix from "matrix-js-sdk";
import {
  decodeRecoveryKey,
  OnlySignedDevicesIsolationMode,
} from "matrix-js-sdk/lib/crypto-api/index.js";
const manifest = JSON.parse(
  await readFile(process.env.MATRIX_INTEROP_MANIFEST, "utf8"),
);
async function control(path) {
  const response = await fetch(manifest.controlURL + path, {
    headers: { Authorization: `Bearer ${manifest.controlToken}` },
  });
  if (!response.ok) throw Error(`Fixture control failed at ${path}`);
  return response.json();
}
const config = await control("/config");
const quiet = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  getChild() {
    return this;
  },
};
const clients = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check, label) {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    if (await check()) return;
    await pause(100);
  }
  throw Error(label);
}
async function open(credentials) {
  const key = decodeRecoveryKey(config.recovery);
  const client = matrix.createClient({
    baseUrl: config.homeserver,
    userId: credentials.user_id,
    deviceId: credentials.device_id,
    accessToken: credentials.access_token,
    logger: quiet,
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) => [Object.keys(keys)[0], key],
    },
  });
  clients.push(client);
  await client.initRustCrypto({ useIndexedDB: false });
  await client.startClient({ initialSyncLimit: 100 });
  await wait(
    () => ["PREPARED", "SYNCING"].includes(client.getSyncState()),
    "Driver sync timed out",
  );
  client
    .getCrypto()
    .setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
  if (
    !(await client
      .getCrypto()
      .userHasCrossSigningKeys(credentials.user_id, true))
  )
    throw Error("Public signing identity missing");
  await client.getCrypto().bootstrapCrossSigning({});
  await client.getCrypto().loadSessionBackupPrivateKeyFromSecretStorage();
  await client.getCrypto().restoreKeyBackup();
  if (!(await client.getCrypto().isCrossSigningReady()))
    throw Error("Driver signing keys not restored");
  return client;
}
async function read(client) {
  const room = client.getRoom(config.roomID);
  if (!room) return [];
  const events = room.getLiveTimeline().getEvents();
  for (const event of events) await client.decryptEventIfNeeded(event);
  return events;
}
try {
  const client = await open(config.native);
  const expected = await control("/ready");
  await wait(async () => {
    const events = await read(client);
    return ["web", "retry", "first", "second"].every((name) =>
      events.some(
        (event) =>
          event.isEncrypted() &&
          event.getContent().body === config.markers[name],
      ),
    );
  }, "Web scenarios not decrypted");
  await wait(
    async () =>
      (await read(client)).some(
        (event) =>
          event.getId() === expected.corruptID && event.isDecryptionFailure(),
      ),
    "Damaged ciphertext was not rejected",
  );
  const events = await read(client);
  if (
    events.filter((event) => event.getContent().body === config.markers.retry)
      .length !== 1
  )
    throw Error("Retry produced duplicate content");
  const damaged = events.find((event) => event.getId() === expected.corruptID);
  if (!damaged?.isDecryptionFailure())
    throw Error("Damaged ciphertext was not rejected");
  await client.sendTextMessage(
    config.roomID,
    config.markers.native,
    "native-once",
  );
  await control("/received");
  // Backups are uploaded asynchronously. A fresh device must recover the old inbound session.
  await pause(2000);
  const fresh = await control("/fresh");
  const restored = await open(fresh.native);
  await restored.scrollback(restored.getRoom(config.roomID), 100);
  await wait(
    async () =>
      (await read(restored)).some(
        (event) => event.getContent().body === config.markers.web,
      ),
    "Fresh device did not recover history",
  );
  await control("/complete");
  console.log(
    "Fixture self-check: strict signed-device crypto, acknowledgement loss, reordering, tamper and recovery passed.",
  );
} finally {
  for (const client of clients) client.stopClient();
}
// The JS SDK can retain test-only retry timers after stopClient.
process.exit(0);
