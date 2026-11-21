import { describe, expect, it, vi } from "vitest";
import {
  SecureMessageOutbox,
  type PendingSecureMessage,
} from "./messageOutbox";

const pending: PendingSecureMessage = {
  transactionID: "stable-transaction",
  chatID: "chat",
  body: "Private draft",
  createdAt: 1,
};

describe("durable protected outbox", () => {
  it("persists before delivery and removes only after acknowledgement", async () => {
    const steps: string[] = [];
    const queue = new SecureMessageOutbox(
      [],
      async (entries) => {
        steps.push(entries.length ? "save-pending" : "save-ack");
      },
      async () => {
        steps.push("send");
      },
    );
    await queue.enqueue("chat", "Private draft");
    await queue.retry();
    expect(steps).toEqual(["save-pending", "send", "save-ack"]);
    expect(queue.snapshot()).toEqual([]);
  });

  it("restores a failed send with the same transaction ID after restart", async () => {
    let persisted: PendingSecureMessage[] = [];
    const save = async (entries: PendingSecureMessage[]) => {
      persisted = entries;
    };
    const first = new SecureMessageOutbox([], save, async () => {
      throw new Error("offline");
    });
    const id = await first.enqueue("chat", "Private draft");
    await first.retry();
    expect(first.error).toBe("offline");
    first.close();
    const deliver = vi.fn(async () => "$event");
    const restarted = new SecureMessageOutbox(persisted, save, deliver);
    await restarted.retry();
    expect(deliver).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ transactionID: id, body: "Private draft" }),
    );
    expect(persisted).toEqual([]);
  });

  it("retains encrypted attachment bytes and transaction ID after restart", async () => {
    const entry: PendingSecureMessage = {
      ...pending,
      attachment: {
        kind: "image",
        mimetype: "image/png",
        size: 3,
        name: "image.png",
        ciphertext: "YWJj",
        file: {
          v: "v2",
          iv: "A".repeat(22),
          hashes: { sha256: "A".repeat(43) },
          key: {
            kty: "oct",
            alg: "A256CTR",
            k: "A".repeat(43),
            ext: true,
            key_ops: ["encrypt", "decrypt"],
          },
        },
      },
    };
    const save = vi.fn(async () => {});
    const first = new SecureMessageOutbox([entry], save, async () => {
      throw Error("offline");
    });
    await first.retry();
    const persisted = first.snapshot();
    first.close();
    const deliver = vi.fn(async () => "$media");
    const second = new SecureMessageOutbox(persisted, save, deliver);
    persisted[0].attachment!.file.key.k = "changed";
    await second.retry();
    expect(deliver).toHaveBeenCalledExactlyOnceWith(entry);
    expect(second.snapshot()).toEqual([]);
  });

  it("does not send when local persistence fails", async () => {
    const deliver = vi.fn();
    const queue = new SecureMessageOutbox(
      [],
      async () => {
        throw new Error("disk full");
      },
      deliver,
    );
    await expect(queue.enqueue("chat", "Secret")).rejects.toThrow("disk full");
    await queue.retry();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("serializes concurrent retries and stops draining on logout", async () => {
    let acknowledge!: () => void;
    const deliver = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const save = vi.fn(async () => {});
    const queue = new SecureMessageOutbox(
      [pending, { ...pending, transactionID: "next" }],
      save,
      deliver,
    );
    const retry = queue.retry();
    expect(queue.retry()).toBe(retry);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    queue.close();
    acknowledge();
    await retry;
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
