import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { matrixApi, type MatrixChatDescriptor } from "./matrixApi";
import { MatrixRoomTransport } from "./matrixRoomTransport";

vi.mock("./matrixApi", async (original) => ({
  ...(await original<typeof import("./matrixApi")>()),
  matrixApi: { descriptor: vi.fn(), bind: vi.fn() },
}));

const own = "@u_alice:matrix.example";
const peer = "@u_bob:matrix.example";
let descriptor: MatrixChatDescriptor;
beforeEach(() => {
  descriptor = {
    chatID: "chat-one",
    roomID: "!room:matrix.example",
    epoch: 2,
    boundEpoch: 2,
    participants: [own, peer].map((id) => ({
      userID: id,
      matrixUserID: id,
      displayName: id,
      active: true,
    })),
  };
  vi.mocked(matrixApi.descriptor).mockImplementation(async () => descriptor);
});

function fixture({
  encrypted = true,
  foreignMember = false,
  changedIdentity = false,
} = {}) {
  const room = {
    roomId: descriptor.roomID,
    getMyMembership: () => "join",
    getPendingEvents: () => [],
    loadMembersIfNeeded: vi.fn(async () => true),
    currentState: {
      getStateEvents: () => ({
        getContent: () => ({
          algorithm: encrypted ? "m.megolm.v1.aes-sha2" : "none",
        }),
      }),
    },
    getMembers: () => [
      ...[own, peer].map((userId) => ({ userId, membership: "join" })),
      ...(foreignMember
        ? [{ userId: "@mallory:matrix.example", membership: "invite" }]
        : []),
    ],
  } as unknown as Room;
  const send = vi.fn(async () => ({ event_id: "$ciphertext-event" }));
  const client = {
    getUserId: () => own,
    getRoom: () => room,
    sendTextMessage: send,
    getCrypto: () => ({
      isCrossSigningReady: async () => true,
      isEncryptionEnabledInRoom: async () => encrypted,
      getUserVerificationStatus: async () => ({
        needsUserApproval: changedIdentity,
        wasCrossSigningVerified: () => false,
        isVerified: () => false,
      }),
    }),
  } as unknown as MatrixClient;
  return { transport: new MatrixRoomTransport(client), send, room, client };
}

describe("protected room delivery", () => {
  it.each([
    [{ encrypted: false }, "Шифрование"],
    [{ foreignMember: true }, "Участники"],
    [{ changedIdentity: true }, "Ключи"],
  ])("refuses unsafe room state %o", async (options, message) => {
    const { transport, send } = fixture(options);
    await expect(
      transport.sendText("chat-one", "Private message"),
    ).rejects.toThrow(message);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a stale membership epoch before sending any content", async () => {
    descriptor.epoch = 3;
    const { transport, send } = fixture();
    await expect(
      transport.sendText("chat-one", "Private message"),
    ).rejects.toThrow("защиты");
    expect(send).not.toHaveBeenCalled();
  });

  it("uses the bound room and stable transaction ID through the official SDK", async () => {
    const { transport, send } = fixture();
    expect(
      await transport.sendText("chat-one", "Private message", "same-retry-id"),
    ).toBe("$ciphertext-event");
    expect(send).toHaveBeenCalledWith(
      "!room:matrix.example",
      "Private message",
      "same-retry-id",
    );
    transport.close();
    await expect(
      transport.sendText("chat-one", "Previous session"),
    ).rejects.toThrow("закрыта");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects a bind response for a different chat", async () => {
    descriptor.roomID = null;
    descriptor.boundEpoch = null;
    const { transport, send, client } = fixture();
    client.createRoom = vi.fn(async () => ({
      room_id: "!created:matrix.example",
    })) as never;
    vi.mocked(matrixApi.bind).mockResolvedValue({
      ...descriptor,
      chatID: "other-chat",
      roomID: "!created:matrix.example",
      boundEpoch: descriptor.epoch,
    });
    await expect(transport.sendText("chat-one", "Secret")).rejects.toThrow(
      "другой диалог",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves encrypted original content when a plaintext edit is aggregated", async () => {
    const { transport, room, client } = fixture();
    const event = {
      isEncrypted: () => true,
      status: null,
      isDecryptionFailure: () => false,
      getType: () => "m.room.message",
      replacingEvent: () => ({
        isEncrypted: () => false,
        getSender: () => peer,
      }),
      getContent: () => ({ body: "Injected plaintext" }),
      getOriginalContent: () => ({ body: "Encrypted original" }),
      getId: () => "$original",
      getSender: () => peer,
      getTs: () => 1,
      isRedacted: () => false,
    };
    room.getLiveTimeline = (() => ({ getEvents: () => [event] })) as never;
    client.decryptEventIfNeeded = vi.fn(async () => {}) as never;
    expect((await transport.history("chat-one"))[0].body).toBe(
      "Encrypted original",
    );
  });
});
