import { randomUUID } from "node:crypto";
import * as matrix from "matrix-js-sdk";

async function withTimeout(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          30_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function waitForSync(client) {
  return withTimeout(
    new Promise((resolve, reject) => {
      client.on(matrix.ClientEvent.Sync, (state) => {
        if (state === "PREPARED") resolve();
        if (state === "ERROR") reject(new Error("Matrix sync failed"));
      });
    }),
    "Matrix sync",
  );
}

// Test-only official-SDK delivery assertion, shared by password and OTP/OIDC harnesses.
// Credentials and content keys remain in memory for this disposable test.
export async function assertEncryptedRoundtrip(homeserver, sender, recipient) {
  const url = new URL(homeserver);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error(
      "Encrypted roundtrip harness requires an HTTP loopback homeserver",
    );
  }
  const quietLogger = {
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    getChild() {
      return this;
    },
  };
  const makeClient = (credentials) =>
    matrix.createClient({
      baseUrl: url.origin,
      accessToken: credentials.access_token,
      userId: credentials.user_id,
      deviceId: credentials.device_id,
      logger: quietLogger,
    });
  const alice = makeClient(sender);
  const bob = makeClient(recipient);
  try {
    await Promise.all([
      alice.initRustCrypto({ useIndexedDB: false }),
      bob.initRustCrypto({ useIndexedDB: false }),
    ]);
    const synced = Promise.all([waitForSync(alice), waitForSync(bob)]);
    await Promise.all([alice.startClient(), bob.startClient()]);
    await synced;
    const room = await alice.createRoom({
      preset: "private_chat",
      invite: [recipient.user_id],
      initial_state: [
        {
          type: "m.room.encryption",
          state_key: "",
          content: { algorithm: "m.megolm.v1.aes-sha2" },
        },
      ],
    });
    await bob.joinRoom(room.room_id);
    if (!(await alice.getCrypto().isEncryptionEnabledInRoom(room.room_id)))
      throw new Error("Sender room is not encrypted");
    const body = `matrix-smoke-${randomUUID()}`;
    const received = new Promise((resolve) => {
      bob.on(matrix.ClientEvent.Event, (event) => {
        if (
          event.getRoomId() !== room.room_id ||
          event.getSender() !== sender.user_id
        )
          return;
        const check = () => {
          if (
            event.getType() === "m.room.message" &&
            event.getContent().body === body
          )
            resolve(event);
        };
        event.on("Event.decrypted", check);
        check();
      });
    });
    await alice.sendTextMessage(room.room_id, body);
    const event = await withTimeout(received, "encrypted message");
    if (!event.isEncrypted())
      throw new Error("Message did not originate as an encrypted event");
    const wire = await alice.fetchRoomEvent(room.room_id, event.getId());
    if (
      wire.type !== "m.room.encrypted" ||
      !wire.content.ciphertext ||
      JSON.stringify(wire).includes(body)
    ) {
      throw new Error(
        "Homeserver event must contain ciphertext without the test plaintext",
      );
    }
  } finally {
    alice.stopClient();
    bob.stopClient();
  }
}
