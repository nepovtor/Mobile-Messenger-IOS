import { createServer } from "node:http";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as matrix from "matrix-js-sdk";
import { OnlySignedDevicesIsolationMode } from "matrix-js-sdk/lib/crypto-api/index.js";

const origin = new URL(process.env.MATRIX_INTEROP_HOMESERVER ?? "");
if (
  origin.protocol !== "https:" ||
  origin.hostname !== "localhost" ||
  !origin.port
)
  throw Error("Loopback TLS fixture required");
const secret = (
  await readFile(process.env.MATRIX_INTEROP_REGISTRATION_FILE, "utf8")
).trim();
const controlToken = randomBytes(32).toString("base64url");
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
const state = {
  completed: false,
  receivedNative: false,
  ackLost: false,
  reordered: false,
  phase: "setup",
};
const results = process.env.MATRIX_INTEROP_RESULT;
const record = async () =>
  writeFile(results, JSON.stringify(state), { mode: 0o600 });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw Error(label);
}
async function json(path, options = {}) {
  const response = await fetch(origin.origin + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) throw Error(`fixture-http-${response.status}`);
  return response.json();
}
const passwords = new Map();
async function register(name) {
  const password = randomBytes(32).toString("base64url");
  passwords.set(name, password);
  const { nonce } = await json("/_synapse/admin/v1/register");
  const mac = createHmac("sha1", secret)
    .update([nonce, name, password, "notadmin"].join("\0"))
    .digest("hex");
  await json("/_synapse/admin/v1/register", {
    method: "POST",
    body: JSON.stringify({
      nonce,
      username: name,
      password,
      admin: false,
      mac,
    }),
  });
}
async function login(name, deviceID) {
  return json("/_matrix/client/v3/login", {
    method: "POST",
    body: JSON.stringify({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: name },
      password: passwords.get(name),
      device_id: deviceID,
    }),
  });
}
async function session(credentials, fetchFn) {
  const keys = new Map();
  const client = matrix.createClient({
    baseUrl: origin.origin,
    userId: credentials.user_id,
    deviceId: credentials.device_id,
    accessToken: credentials.access_token,
    logger: quiet,
    fetchFn,
    // Independent test sends deliberately bypass FIFO so ciphertext can arrive out of order.
    scheduler: new matrix.MatrixScheduler(
      () => -1,
      () => null,
    ),
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys: requested }) => {
        const id = Object.keys(requested).find((id) => keys.has(id));
        return id ? [id, keys.get(id)] : null;
      },
      cacheSecretStorageKey: (id, _info, key) =>
        keys.set(id, new Uint8Array(key)),
    },
  });
  await client.initRustCrypto({ useIndexedDB: false });
  await client.startClient({
    initialSyncLimit: 100,
    pendingEventOrdering: matrix.PendingEventOrdering.Detached,
  });
  await wait(
    () => ["PREPARED", "SYNCING"].includes(client.getSyncState()),
    "initial-sync",
  );
  const api = client.getCrypto();
  api.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
  return { client, api, keys };
}
async function setupRecovery(runtime) {
  const generated = await runtime.api.createRecoveryKeyFromPassphrase();
  await runtime.api.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: (request) => request(null),
  });
  await runtime.api.bootstrapSecretStorage({
    createSecretStorageKey: async () => generated,
    setupNewKeyBackup: true,
  });
  await runtime.api.bootstrapCrossSigning({});
  if (!(await runtime.api.isCrossSigningReady()))
    throw Error("cross-signing-not-ready");
  await runtime.api.checkKeyBackupAndEnable();
  return generated.encodedPrivateKey;
}
await register("interop_alice");
await register("interop_bob");
let reorder = false,
  first,
  held,
  dropped = false,
  dropNext = false;
const sendOrder = [];
const peerFetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const encryptedSend = url.pathname.includes("/send/m.room.encrypted/");
  if (reorder && encryptedSend) {
    if (!first) {
      first = true;
      await Promise.race([
        new Promise((resolve) => {
          held = resolve;
        }),
        delay(10000).then(() => {
          throw Error("reorder-second-request-missing");
        }),
      ]);
      const response = await fetch(input, init);
      sendOrder.push("first");
      return response;
    }
    reorder = false;
    const response = await fetch(input, init);
    sendOrder.push("second");
    held();
    return response;
  }
  const response = await fetch(input, init);
  if (dropNext && encryptedSend && response.ok && !dropped) {
    dropped = true;
    dropNext = false;
    state.ackLost = true;
    throw new TypeError("Synthetic acknowledgement loss after server commit");
  }
  return response;
};
const alice = await session(await login("interop_alice", "ALICE_SEED"));
const bob = await session(await login("interop_bob", "BOB_WEB"), peerFetch);
const recovery = await setupRecovery(alice);
await setupRecovery(bob);
const native = await login("interop_alice", "ALICE_IOS");
const { room_id: roomID } = await alice.client.createRoom({
  preset: "private_chat",
  invite: [bob.client.getUserId()],
  initial_state: [
    {
      type: "m.room.encryption",
      state_key: "",
      content: { algorithm: "m.megolm.v1.aes-sha2" },
    },
    {
      type: "m.room.history_visibility",
      state_key: "",
      content: { history_visibility: "joined" },
    },
  ],
});
await bob.client.joinRoom(roomID);
await wait(
  () => alice.client.getRoom(roomID)?.getJoinedMemberCount() === 2,
  "room-membership",
);
const markers = Object.fromEntries(
  ["web", "native", "retry", "first", "second"].map((name) => [
    name,
    `interop-${name}-${randomUUID()}`,
  ]),
);
let corruptID, originalSessionID, webEventID;
const observed = new Map();
bob.client.on(matrix.ClientEvent.Event, (event) => {
  if (event.getRoomId() !== roomID) return;
  const capture = () => {
    if (
      event.getType() === "m.room.message" &&
      typeof event.getContent().body === "string"
    )
      observed.set(event.getContent().body, event);
  };
  event.on(matrix.MatrixEventEvent.Decrypted, capture);
  capture();
});
async function deliverScenarios() {
  state.phase = "web-send";
  await record();
  const sent = await bob.client.sendTextMessage(
    roomID,
    markers.web,
    "web-once",
  );
  const wire = await bob.client.fetchRoomEvent(roomID, sent.event_id);
  if (
    wire.type !== "m.room.encrypted" ||
    JSON.stringify(wire).includes(markers.web)
  )
    throw Error("plaintext-wire");
  originalSessionID = wire.content.session_id;
  webEventID = sent.event_id;
  state.phase = "ack-loss";
  await record();
  dropNext = true;
  try {
    await bob.client.sendTextMessage(roomID, markers.retry, "stable-retry");
  } catch {
    /* Stored by Synapse; retry the SDK event below. */
  }
  const pending = bob.client
    .getRoom(roomID)
    .getPendingEvents()
    .find((event) => event.getTxnId() === "stable-retry");
  if (pending)
    await bob.client.resendEvent(pending, bob.client.getRoom(roomID));
  else await bob.client.sendTextMessage(roomID, markers.retry, "stable-retry");
  if (!state.ackLost) throw Error("ack-loss-not-exercised");
  state.phase = "reorder";
  await record();
  reorder = true;
  await Promise.all([
    bob.client.sendTextMessage(roomID, markers.first, "reorder-first"),
    bob.client.sendTextMessage(roomID, markers.second, "reorder-second"),
  ]);
  if (sendOrder.join(",") !== "second,first")
    throw Error("reorder-not-exercised");
  state.reordered = true;
  state.phase = "tamper";
  await record();
  const damaged = {
    ...wire.content,
    ciphertext:
      (wire.content.ciphertext[0] === "A" ? "B" : "A") +
      wire.content.ciphertext.slice(1),
  };
  const corrupted = await bob.client.sendEvent(
    roomID,
    matrix.EventType.RoomMessageEncrypted,
    damaged,
    "damaged-ciphertext",
  );
  corruptID = corrupted.event_id;
  state.phase = "native-exchange";
  await record();
}
let scenarios;
const control = createServer(async (request, response) => {
  const authorization = request.headers.authorization ?? "";
  const expected = `Bearer ${controlToken}`;
  if (
    authorization.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ) {
    response.writeHead(403).end();
    return;
  }
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  const reply = (value) => {
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(value));
  };
  try {
    if (path === "/config")
      return reply({
        homeserver: origin.origin,
        native,
        recovery,
        roomID,
        markers,
        certificateFile: process.env.MATRIX_INTEROP_CERTIFICATE,
      });
    if (path === "/ready") {
      scenarios ??= deliverScenarios();
      await scenarios;
      return reply({ corruptID, sessionID: originalSessionID, webEventID });
    }
    if (path === "/fresh") {
      state.phase = "backup-upload";
      await record();
      await wait(async () => {
        const backup = await json("/_matrix/client/v3/room_keys/version", {
          headers: { Authorization: `Bearer ${alice.client.getAccessToken()}` },
        });
        return backup.count >= 2;
      }, "backup-incomplete");
      // No old device may answer a room-key request during recovery acceptance.
      alice.client.stopClient();
      bob.client.stopClient();
      return reply({ native: await login("interop_alice", "ALICE_RECOVERED") });
    }
    if (path === "/received") {
      await wait(
        () => observed.has(markers.native),
        "native-send-not-received",
      );
      const event = observed.get(markers.native);
      const wire = await bob.client.fetchRoomEvent(roomID, event.getId());
      if (
        !event.isEncrypted() ||
        wire.type !== "m.room.encrypted" ||
        JSON.stringify(wire).includes(markers.native)
      )
        throw Error("native-plaintext-wire");
      state.receivedNative = true;
      await record();
      return reply({ received: true });
    }
    if (path === "/complete") {
      if (
        !state.receivedNative ||
        !state.ackLost ||
        !state.reordered ||
        !corruptID
      )
        throw Error("incomplete-fixture");
      state.completed = true;
      state.phase = "complete";
      await record();
      return reply({ completed: true });
    }
    response.writeHead(404).end();
  } catch (error) {
    state.failureCode = `phase-${state.phase}-${error.name}-${error.errcode ?? ""}-${error.httpStatus ?? ""}`;
    console.error(error);
    await record();
    response
      .writeHead(500, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: state.failureCode }));
  }
});
await new Promise((resolve) => control.listen(0, "127.0.0.1", resolve));
await writeFile(
  process.env.MATRIX_INTEROP_MANIFEST,
  JSON.stringify({
    controlURL: `http://127.0.0.1:${control.address().port}`,
    controlToken,
    certificateFile: process.env.MATRIX_INTEROP_CERTIFICATE,
  }),
  { mode: 0o600 },
);
const deadline = setTimeout(
  () => {
    state.failureCode = "fixture-deadline";
    void record().finally(() => process.exit(1));
  },
  12 * 60 * 1000,
);
const close = () => {
  clearTimeout(deadline);
  alice.client.stopClient();
  bob.client.stopClient();
  control.close();
  process.exit();
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
