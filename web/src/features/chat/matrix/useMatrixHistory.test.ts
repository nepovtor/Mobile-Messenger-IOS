import { EventEmitter } from "node:events";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMatrixHistory } from "./useMatrixHistory";
import type { MatrixSession } from "./matrixSession";
import type { SecureMessage } from "./matrixRoomTransport";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const message = (body: string) => [
  {
    id: body,
    body,
    own: false,
    sender: "peer",
    timestamp: 1,
    failedToDecrypt: false,
  },
];

describe("protected history lifecycle", () => {
  it("ignores late history from the previously selected conversation", async () => {
    const old = deferred<SecureMessage[]>();
    const client = new EventEmitter();
    const history = vi.fn((chatID: string) =>
      chatID === "old"
        ? old.promise
        : Promise.resolve(message("Current conversation")),
    );
    const session = {
      client,
      transport: { history },
    } as unknown as MatrixSession;
    const { result, rerender, unmount } = renderHook(
      ({ chatID }) => useMatrixHistory(session, chatID),
      { initialProps: { chatID: "old" } },
    );
    rerender({ chatID: "new" });
    await waitFor(() =>
      expect(result.current.messages[0]?.body).toBe("Current conversation"),
    );
    await act(async () =>
      old.resolve(message("Previous private conversation")),
    );
    expect(result.current.messages[0]?.body).toBe("Current conversation");
    unmount();
    expect(client.eventNames()).toEqual([]);
  });

  it("clears displayed history immediately when the session locks", async () => {
    const session = {
      client: new EventEmitter(),
      transport: { history: async () => message("Private content") },
    } as unknown as MatrixSession;
    const { result, rerender } = renderHook(
      ({ session }) => useMatrixHistory(session, "chat"),
      { initialProps: { session: session as MatrixSession | null } },
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    rerender({ session: null });
    expect(result.current.messages).toEqual([]);
  });
});
