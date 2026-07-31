import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import {
  appLogger,
  buildSafeRequestLogMeta,
  createRequestLoggingMiddleware,
  getSafeRoutePath,
  hashIpAddress,
  isSensitiveLogKey,
  sanitizeLogString,
  sanitizeLogValue,
} from "../src/modules/common/app-logger";

test("recursive log sanitization redacts sensitive keys case-insensitively", () => {
  const sanitized = sanitizeLogValue(
    {
      requestId: "request_12345678",
      nested: [
        {
          PASSWORD: "correct horse battery staple",
          Otp: "123456",
          messageText: "hello",
          ciphertext: "encrypted-message",
          identityPublicKey: "public-key",
          LATITUDE: 53.9,
          phoneNumber: "+375291234567",
          pushEndpoint: "https://push.example/device",
          objectKey: "private/user/file",
          safe: "retained",
        },
      ],
      errorCode: "INVALID_CODE",
    },
    { includeErrorStack: false },
  );

  assert.deepEqual(sanitized, {
    requestId: "request_12345678",
    nested: [
      {
        PASSWORD: "[redacted]",
        Otp: "[redacted]",
        messageText: "[redacted]",
        ciphertext: "[redacted]",
        identityPublicKey: "[redacted]",
        LATITUDE: "[redacted]",
        phoneNumber: "[redacted]",
        pushEndpoint: "[redacted]",
        objectKey: "[redacted]",
        safe: "retained",
      },
    ],
    errorCode: "INVALID_CODE",
  });
  assert.equal(isSensitiveLogKey("Refresh_Token"), true);
  assert.equal(isSensitiveLogKey("requestId"), false);
});

test("string sanitization removes tokens, phone numbers and signed URLs", () => {
  const raw =
    "Bearer abc.def.ghi phone=+375291234567 " +
    "https://storage.example.test/file?X-Amz-Signature=signed-value";
  const sanitized = sanitizeLogString(raw);

  assert.doesNotMatch(sanitized, /abc\.def\.ghi/);
  assert.doesNotMatch(sanitized, /375291234567/);
  assert.doesNotMatch(sanitized, /signed-value/);
  assert.match(sanitized, /\[redacted-url\]/);
});

test("production-style error sanitization omits stack traces", () => {
  const error = new Error("token=private-value");
  const sanitized = sanitizeLogValue(error, {
    includeErrorStack: false,
  });

  assert.deepEqual(sanitized, {
    message: "token=[redacted]",
    name: "Error",
  });
});

test("safe route helper uses templates and strips fallback parameters", () => {
  assert.equal(
    getSafeRoutePath({
      baseUrl: "/api",
      route: { path: "/push/devices/:token" },
      originalUrl: "/api/push/devices/private-token?code=123456",
      url: "/push/devices/private-token?code=123456",
    }),
    "/api/push/devices/:token",
  );
  assert.equal(
    getSafeRoutePath({
      baseUrl: "",
      originalUrl:
        "/api/media/550e8400-e29b-41d4-a716-446655440000?token=private",
      url: "/api/media/550e8400-e29b-41d4-a716-446655440000",
    }),
    "/api/media/:param",
  );
});

test("IP hashing is stable, keyed and never returns the raw address", () => {
  const first = hashIpAddress("::ffff:203.0.113.10", "K".repeat(48));
  const normalized = hashIpAddress("203.0.113.10", "K".repeat(48));
  const otherKey = hashIpAddress("203.0.113.10", "L".repeat(48));

  assert.equal(first, normalized);
  assert.notEqual(first, "203.0.113.10");
  assert.notEqual(first, otherKey);
  assert.equal(hashIpAddress("203.0.113.10", null), null);
});

test("safe request metadata drops every non-allowlisted field", () => {
  const safe = buildSafeRequestLogMeta({
    requestId: "request_12345678",
    method: "post",
    route: "/api/auth/verify",
    statusCode: 201,
    durationMs: 12,
    userID: "internal-user-id",
    ipHash: "hashed-ip",
    errorCode: null,
    ...({
      body: { code: "123456" },
      headers: { authorization: "Bearer private" },
      query: { token: "private" },
      url: "/api/auth/verify?code=123456",
    } as Record<string, unknown>),
  });

  assert.deepEqual(Object.keys(safe).sort(), [
    "durationMs",
    "errorCode",
    "ipHash",
    "method",
    "requestId",
    "route",
    "statusCode",
    "userID",
  ]);
});

test("request middleware emits only the minimal safe metadata", async (t) => {
  const previousHashKey = process.env["LOG_IP_HASH_KEY"];
  process.env["LOG_IP_HASH_KEY"] = "M".repeat(48);
  t.after(() => {
    if (previousHashKey === undefined) {
      delete process.env["LOG_IP_HASH_KEY"];
    } else {
      process.env["LOG_IP_HASH_KEY"] = previousHashKey;
    }
  });

  const originalRequestLogger = appLogger.request;
  let captured: Record<string, unknown> | null = null;
  appLogger.request = async (meta) => {
    captured = meta;
  };
  t.after(() => {
    appLogger.request = originalRequestLogger;
  });

  const responseHeaders = new Map<string, string>();
  const response = Object.assign(new EventEmitter(), {
    locals: { errorCode: "INVALID_CODE" },
    setHeader(name: string, value: string): void {
      responseHeaders.set(name, value);
    },
    statusCode: 401,
  }) as unknown as Response;
  const request = {
    baseUrl: "/api",
    body: { code: "123456", phone: "+375291234567" },
    headers: {
      authorization: "Bearer private-token",
      "x-request-id": "request_12345678",
    },
    ip: "203.0.113.10",
    method: "POST",
    originalUrl: "/api/auth/verify?code=123456",
    query: { code: "123456" },
    route: { path: "/auth/verify" },
    socket: { remoteAddress: "203.0.113.10" },
    url: "/auth/verify?code=123456",
    user: { sub: "internal-user-id" },
  } as unknown as Request;

  let nextCalled = false;
  createRequestLoggingMiddleware()(request, response, () => {
    nextCalled = true;
  });
  response.emit("finish");
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(nextCalled, true);
  assert.equal(responseHeaders.get("X-Request-ID"), "request_12345678");
  assert.ok(captured);
  assert.deepEqual(Object.keys(captured).sort(), [
    "durationMs",
    "errorCode",
    "ipHash",
    "method",
    "requestId",
    "route",
    "statusCode",
    "userID",
  ]);
  assert.equal(captured["route"], "/api/auth/verify");
  assert.equal(captured["userID"], "internal-user-id");
  assert.equal(captured["errorCode"], "INVALID_CODE");
  assert.notEqual(captured["ipHash"], "203.0.113.10");
  const serialized = JSON.stringify(captured);
  assert.doesNotMatch(serialized, /private-token|\+375/);
  assert.equal(serialized.includes('"code":"123456"'), false);
});
