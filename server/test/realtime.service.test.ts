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

type ConnectionMetaProbe = {
  userID: string;
  lastPongAt: number;
};

type RealtimeServiceProbe = {
  connectionMeta: Map<WebSocket, ConnectionMetaProbe | object>;
  flushHeartbeat: () => void;
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
  process.env["REALTIME_HEARTBEAT_INTERVAL_MS"] = "10";
  process.env["REALTIME_HEARTBEAT_TIMEOUT_MS"] = "20";

  const service = new RealtimeService();
  const socket = createFakeSocket() as WebSocket & FakeSocket;
  service.registerConnection("user-1", "device-1", socket);

  const serviceProbe = service as object as RealtimeServiceProbe;
  const meta = serviceProbe.connectionMeta.get(socket) as
    | ConnectionMetaProbe
    | undefined;
  assert.ok(meta);
  meta.lastPongAt = Date.now() - 100;

  serviceProbe.flushHeartbeat();

  assert.equal(serviceProbe.connectionMeta.size, 0);
  assert.equal(socket.terminated, true);
});

test("heartbeat pings healthy connections", () => {
  process.env["REALTIME_HEARTBEAT_INTERVAL_MS"] = "10";
  process.env["REALTIME_HEARTBEAT_TIMEOUT_MS"] = "200";

  const service = new RealtimeService();
  const socket = createFakeSocket() as WebSocket & FakeSocket;
  service.registerConnection("user-1", "device-1", socket);

  const serviceProbe = service as object as RealtimeServiceProbe;
  serviceProbe.flushHeartbeat();

  assert.equal(socket.pingCount, 1);
  assert.equal(socket.terminated, false);
});

test("realtime enforces a per-IP connection ceiling", () => {
  const service = new RealtimeService();
  for (let index = 0; index < 24; index += 1) {
    const socket = createFakeSocket() as WebSocket & FakeSocket;
    assert.equal(
      service.registerConnection(
        `user-${index}`,
        `device-${index}`,
        socket,
        "ip-key",
      ),
      true,
    );
  }

  const rejectedSocket = createFakeSocket() as WebSocket & FakeSocket;
  assert.equal(
    service.registerConnection(
      "user-rejected",
      "device-rejected",
      rejectedSocket,
      "ip-key",
    ),
    false,
  );
});

test("realtime rate limits each event type per connection", () => {
  const service = new RealtimeService();
  const socket = createFakeSocket() as WebSocket & FakeSocket;
  assert.equal(
    service.registerConnection("user-1", "device-1", socket, "ip-key"),
    true,
  );

  for (let index = 0; index < 60; index += 1) {
    assert.equal(service.consumeEventQuota(socket, "typing.started"), true);
  }
  assert.equal(service.consumeEventQuota(socket, "typing.started"), false);
  assert.equal(service.consumeEventQuota(socket, "message.read"), true);
});
