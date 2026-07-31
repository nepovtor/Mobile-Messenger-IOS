import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { Repository } from "typeorm";
import { RefreshTokenEntity } from "../src/entities/refresh-token.entity";
import { createTestApp } from "./support/auth-chat-test-harness";

test("web auth keeps tokens in HttpOnly cookies and rotates the session", async (t) => {
  const app = await createTestApp();
  t.after(async () => app.close());
  const client = request.agent(app.getHttpServer());
  const headers = {
    "X-Client-Platform": "web",
    "X-Device-ID": "web-device-security-test",
  };

  await client
    .post("/api/auth/request")
    .set(headers)
    .send({ phone: "+15550009001" })
    .expect(201);
  const login = await client
    .post("/api/auth/verify")
    .set(headers)
    .send({ phone: "+15550009001", code: "123456" })
    .expect(201);

  assert.equal("token" in login.body, false);
  assert.equal("refreshToken" in login.body, false);
  const cookies = login.headers["set-cookie"] as unknown as string[];
  assert.ok(cookies.some((cookie) => cookie.startsWith("mm_access=")));
  assert.ok(cookies.some((cookie) => cookie.startsWith("mm_refresh=")));
  assert.ok(cookies.every((cookie) => /HttpOnly/i.test(cookie)));

  await client.get("/api/auth/me").set(headers).expect(200);
  const sessions = await client
    .get("/api/auth/sessions")
    .set(headers)
    .expect(200);
  assert.equal(sessions.body.length, 1);
  assert.equal(sessions.body[0].current, true);
  assert.equal("ipHash" in sessions.body[0], false);
  assert.equal("userAgentHash" in sessions.body[0], false);

  const refreshed = await client
    .post("/api/auth/refresh")
    .set(headers)
    .send({})
    .expect(200);
  assert.equal("token" in refreshed.body, false);
  await client.get("/api/auth/me").set(headers).expect(200);

  await client.post("/api/auth/logout").set(headers).send({}).expect(204);
  await client.get("/api/auth/me").set(headers).expect(401);
});

test("refresh-token reuse revokes the whole token family", async (t) => {
  const app = await createTestApp();
  t.after(async () => app.close());
  const client = request(app.getHttpServer());
  const headers = {
    "X-Client-Platform": "ios",
    "X-Device-ID": "ios-device-security-test",
    "X-Device-Name": "Mobile Messenger iOS",
  };

  await client
    .post("/api/auth/request")
    .set(headers)
    .send({ phone: "+15550009002" })
    .expect(201);
  const login = await client
    .post("/api/auth/verify")
    .set(headers)
    .send({ phone: "+15550009002", code: "123456" })
    .expect(201);
  const firstRefreshToken = login.body.refreshToken as string;
  assert.equal(typeof login.body.token, "string");
  assert.equal(typeof firstRefreshToken, "string");

  const rotated = await client
    .post("/api/auth/refresh")
    .set(headers)
    .send({ refreshToken: firstRefreshToken })
    .expect(200);
  const secondRefreshToken = rotated.body.refreshToken as string;
  assert.notEqual(secondRefreshToken, firstRefreshToken);

  await client
    .post("/api/auth/refresh")
    .set(headers)
    .send({ refreshToken: firstRefreshToken })
    .expect(401);
  await client
    .post("/api/auth/refresh")
    .set(headers)
    .send({ refreshToken: secondRefreshToken })
    .expect(401);
  await client
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${rotated.body.token as string}`)
    .expect(401);

  const repository = app.get<Repository<RefreshTokenEntity>>(
    getRepositoryToken(RefreshTokenEntity),
  );
  const storedTokens = await repository.find();
  assert.equal(storedTokens.length, 2);
  assert.ok(storedTokens.every((token) => token.tokenHash.length === 64));
  assert.ok(
    storedTokens.every(
      (token) =>
        token.tokenHash !== firstRefreshToken &&
        token.tokenHash !== secondRefreshToken,
    ),
  );
  assert.ok(storedTokens.every((token) => token.revokedAt instanceof Date));
});
