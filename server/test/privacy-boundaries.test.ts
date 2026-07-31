import assert from "node:assert/strict";
import test from "node:test";
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { EncryptedAttachmentEntity } from "../src/entities/encrypted-attachment.entity";
import { MediaEntity } from "../src/entities/media.entity";
import { UserEntity } from "../src/entities/user.entity";
import { AuthService } from "../src/modules/auth/auth.service";
import { MediaService } from "../src/modules/media/media.service";
import { UsersService } from "../src/modules/users/users.service";

const STORAGE_ENV_KEYS = [
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_BUCKET",
] as const;

test("media: encrypted upload fails closed when private storage credentials are absent", async (t) => {
  const restoreEnvironment = snapshotEnvironment([
    ...STORAGE_ENV_KEYS,
    "NODE_ENV",
    "E2EE_REQUIRED",
  ]);
  t.after(restoreEnvironment);
  process.env["NODE_ENV"] = "test";
  process.env["E2EE_REQUIRED"] = "true";
  for (const key of STORAGE_ENV_KEYS) {
    delete process.env[key];
  }

  const service = createMediaService();
  await assert.rejects(
    service.createEncryptedUploadUrl("00000000-0000-4000-8000-000000000001", {
      sizeBytes: 1024,
      ciphertextSha256: "a".repeat(64),
    }),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
});

test("media: production rejects the legacy plaintext image path", async (t) => {
  const restoreEnvironment = snapshotEnvironment(["NODE_ENV", "E2EE_REQUIRED"]);
  t.after(restoreEnvironment);
  process.env["NODE_ENV"] = "production";
  process.env["E2EE_REQUIRED"] = "false";

  const service = createMediaService();
  await assert.rejects(
    service.createUploadUrl("00000000-0000-4000-8000-000000000001", {
      mimeType: "image/png",
      sizeBytes: 256,
    }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

test("media: E2EE-required environments reject the legacy plaintext image path", async (t) => {
  const restoreEnvironment = snapshotEnvironment(["NODE_ENV", "E2EE_REQUIRED"]);
  t.after(restoreEnvironment);
  process.env["NODE_ENV"] = "test";
  process.env["E2EE_REQUIRED"] = "true";

  const service = createMediaService();
  await assert.rejects(
    service.createUploadUrl("00000000-0000-4000-8000-000000000001", {
      mimeType: "image/png",
      sizeBytes: 256,
    }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

test("users: public password registration is unavailable in production", async (t) => {
  const restoreEnvironment = snapshotEnvironment(["NODE_ENV"]);
  t.after(restoreEnvironment);
  process.env["NODE_ENV"] = "production";

  const service = new UsersService(
    {} as Repository<UserEntity>,
    {} as AuthService,
  );
  await assert.rejects(
    service.createUser({
      login: "attacker@example.test",
      password: "Arbitrary-password-123",
      displayName: "Attacker",
    }),
    (error: unknown) => error instanceof NotFoundException,
  );
});

function createMediaService(): MediaService {
  return new MediaService(
    {} as Repository<MediaEntity>,
    {} as Repository<EncryptedAttachmentEntity>,
  );
}

function snapshotEnvironment(keys: readonly string[]): () => void {
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  return () => {
    for (const [key, value] of snapshot) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
