import {
  encryptAttachment,
  decryptAttachment,
} from "matrix-encrypt-attachment";
// Self-check for the disposable fixture. This is not the Swift/iOS acceptance run.
import { readFile } from "node:fs/promises";
import * as matrix from "matrix-js-sdk";
import {
  CryptoEvent,
  VerificationRequestEvent,
  VerificationPhase,
  VerifierEvent,
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
async function open(credentials, recoveryKey = config.recovery) {
  let key = recoveryKey ? decodeRecoveryKey(recoveryKey) : undefined;
  const client = matrix.createClient({
    baseUrl: config.homeserver,
    userId: credentials.user_id,
    deviceId: credentials.device_id,
    accessToken: credentials.access_token,
    logger: quiet,
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) =>
        key ? [Object.keys(keys)[0], key] : null,
      cacheSecretStorageKey: (_id, _info, value) => {
        key = value;
      },
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
  const api = client.getCrypto();
  if (recoveryKey) {
    if (!(await api.userHasCrossSigningKeys(credentials.user_id, true)))
      throw Error("Public signing identity missing");
    await api.bootstrapCrossSigning({});
    await api.loadSessionBackupPrivateKeyFromSecretStorage();
    await api.restoreKeyBackup();
  } else {
    const generated = await api.createRecoveryKeyFromPassphrase();
    key = generated.privateKey;
    await api.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: (request) => request(null),
    });
    await api.bootstrapSecretStorage({
      createSecretStorageKey: async () => generated,
      setupNewKeyBackup: true,
    });
    await api.bootstrapCrossSigning({});
  }
  if (!(await api.isCrossSigningReady()))
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
  let incoming, incomingSas, incomingDone;
  client.on(CryptoEvent.VerificationRequestReceived, (request) => {
    incoming = request;
  });
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
  const attachments = await control("/attachments");
  await wait(async () => {
    const events = await read(client);
    return [
      attachments.imageID,
      attachments.audioID,
      attachments.corruptID,
    ].every((id) =>
      events.some(
        (event) => event.getId() === id && event.getType() === "m.room.message",
      ),
    );
  }, "Attachment metadata not decrypted");
  for (const [id, base64] of [
    [attachments.imageID, attachments.imageBytesBase64],
    [attachments.audioID, attachments.audioBytesBase64],
    [attachments.corruptID, attachments.imageBytesBase64],
  ]) {
    const event = (await read(client)).find((value) => value.getId() === id);
    const file = event.getContent().file;
    const url = client.mxcUrlToHttp(
      file.url,
      undefined,
      undefined,
      undefined,
      false,
      false,
      true,
    );
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${client.getAccessToken()}` },
    });
    const cipher = await response.arrayBuffer();
    if (id === attachments.corruptID) {
      let rejected = false;
      try {
        await decryptAttachment(cipher, file);
      } catch {
        rejected = true;
      }
      if (!rejected) throw Error("Corrupt media was accepted");
    } else if (
      !Buffer.from(await decryptAttachment(cipher, file)).equals(
        Buffer.from(base64, "base64"),
      )
    )
      throw Error("Attachment bytes differ");
  }
  for (const [base64, name, mime] of [
    [attachments.imageBytesBase64, "native-image.png", "image/png"],
    [attachments.audioBytesBase64, "native-audio.wav", "audio/wav"],
  ]) {
    const bytes = Buffer.from(base64, "base64");
    const encrypted = await encryptAttachment(Uint8Array.from(bytes).buffer);
    const upload = await client.uploadContent(new Uint8Array(encrypted.data), {
      type: "application/octet-stream",
      includeFilename: false,
    });
    await client.sendMessage(config.roomID, {
      msgtype: mime.startsWith("image/") ? "m.image" : "m.audio",
      body: name,
      file: { ...encrypted.info, url: upload.content_uri },
      info: { mimetype: mime, size: bytes.length },
    });
  }
  await control("/attachments-received");
  const group = await control("/group");
  await wait(
    () => Boolean(client.getRoom(group.roomID)),
    "Group missing from native-equivalent sync",
  );
  await wait(async () => {
    for (const event of client
      .getRoom(group.roomID)
      .getLiveTimeline()
      .getEvents()) {
      await client.decryptEventIfNeeded(event);
      if (event.getContent().body === group.after) return true;
    }
    return false;
  }, "Remaining member did not decrypt rotated group session");
  await client.sendTextMessage(group.roomID, group.native);
  await control("/group-received");
  await control("/verify");
  await wait(() => Boolean(incoming), "SAS request was not received");
  incoming.on(VerificationRequestEvent.Change, () => {
    if (
      incoming.phase === VerificationPhase.Started &&
      incoming.verifier &&
      !incomingDone
    ) {
      const verifier = incoming.verifier;
      verifier.on(VerifierEvent.ShowSas, (value) => {
        incomingSas = value;
      });
      incomingSas = verifier.getShowSasCallbacks() ?? incomingSas;
      incomingDone = verifier.verify();
      void incomingDone.catch(() => undefined);
    }
  });
  await incoming.accept();
  await wait(() => Boolean(incomingSas), "SAS codes were not displayed");
  const remoteSas = await control("/sas");
  if (
    JSON.stringify(incomingSas.sas.emoji?.map((value) => value[0]) ?? []) !==
    JSON.stringify(remoteSas.emoji)
  )
    throw Error("SAS symbols differ");
  await incomingSas.confirm();
  await control("/confirm-sas");
  await incomingDone;
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
  const firstDevice = await control("/new-account");
  await open(firstDevice.native, null);
  await control("/first-device-check");
  await control("/complete");
  console.log(
    "Fixture self-check: strict signed-device crypto, acknowledgement loss, reordering, tamper and recovery passed.",
  );
} finally {
  for (const client of clients) client.stopClient();
}
// The JS SDK can retain test-only retry timers after stopClient.
process.exit(0);
