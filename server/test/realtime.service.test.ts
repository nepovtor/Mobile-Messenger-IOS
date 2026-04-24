import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { RealtimeService } from "../src/modules/realtime/realtime.service";

type FakeSocket = {
  readyState: number;
  pingCount: number;
  terminated: boolean;
  listeners: Record<string, Array<() => void>>;
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
  ping: () => void;
  terminate: () => void;
};

function createFakeSocket(): FakeSocket {
  return {
    readyState: WebSocket.OPEN,
    pingCount: 0,
    terminated: false,
    listeners: {},
    on(event, listener) {
      this.listeners[event] = this.listeners[event] ?? [];
      this.listeners[event].push(listener);
    },
    off(event, listener) {
      this.listeners[event] = (this.listeners[event] ?? []).filter(
        (item) => item !== listener,
      );
    },
    ping() {
      this.pingCount += 1;
    },
    terminate() {
      this.terminated = true;
      this.readyState = WebSocket.CLOSED;
    },
  };
}

test("heartbeat closes dead connections", () => {
  process.env.REALTIME_HEARTBEAT_INTERVAL_MS = "10";
  process.env.REALTIME_HEARTBEAT_TIMEOUT_MS = "20";

  const service = new RealtimeService();
  const socket = createFakeSocket() as unknown as WebSocket;
  service.registerConnection("user-1", socket);

  const meta = (
    service as unknown as {
      connectionMeta: Map<WebSocket, { lastPongAt: number; userID: string }>;
    }
  ).connectionMeta.get(socket);
  assert.ok(meta);
  meta.lastPongAt = Date.now() - 100;

  (service as unknown as { flushHeartbeat: () => void }).flushHeartbeat();

  assert.equal(
    (service as unknown as { connectionMeta: Map<WebSocket, unknown> })
      .connectionMeta.size,
    0,
  );
  assert.equal((socket as unknown as FakeSocket).terminated, true);
});

test("heartbeat pings healthy connections", () => {
  process.env.REALTIME_HEARTBEAT_INTERVAL_MS = "10";
  process.env.REALTIME_HEARTBEAT_TIMEOUT_MS = "200";

  const service = new RealtimeService();
  const socket = createFakeSocket() as unknown as WebSocket;
  service.registerConnection("user-1", socket);

  (service as unknown as { flushHeartbeat: () => void }).flushHeartbeat();

  assert.equal((socket as unknown as FakeSocket).pingCount, 1);
  assert.equal((socket as unknown as FakeSocket).terminated, false);
});
