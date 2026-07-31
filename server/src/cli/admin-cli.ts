import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { In, IsNull } from "typeorm";
import {
  AuthSessionEntity,
  SessionPrincipalType,
} from "../entities/auth-session.entity";
import { AdminEntity } from "../entities/admin.entity";
import { RefreshTokenEntity } from "../entities/refresh-token.entity";
import {
  SecurityActorType,
  SecurityAuditEventEntity,
  SecurityAuditOutcome,
} from "../entities/security-audit-event.entity";
import { AppDataSource } from "../database/data-source";
import {
  hashAdministrativePassword,
  validateAdministrativePassword,
} from "../modules/common/password";

type AdminCommand =
  | "create"
  | "deactivate"
  | "password"
  | "revoke-sessions"
  | "show";

async function main(): Promise<void> {
  const command = process.argv[2] as AdminCommand | undefined;
  if (
    !command ||
    !["create", "deactivate", "password", "revoke-sessions", "show"].includes(
      command,
    )
  ) {
    throw new Error(
      "Usage: admin-cli <create|deactivate|password|revoke-sessions|show> [--login LOGIN]",
    );
  }

  await AppDataSource.initialize();
  try {
    const login = await resolveLogin();
    switch (command) {
      case "create":
        await createAdmin(login);
        break;
      case "deactivate":
        await deactivateAdmin(login);
        break;
      case "password":
        await changePassword(login);
        break;
      case "revoke-sessions":
        await revokeSessions(login, "administrative CLI revocation");
        break;
      case "show":
        await showAdmin(login);
        break;
    }
  } finally {
    await AppDataSource.destroy();
  }
}

async function createAdmin(login: string): Promise<void> {
  const admins = AppDataSource.getRepository(AdminEntity);
  if (await admins.existsBy({ login })) {
    throw new Error(`Administrator "${login}" already exists`);
  }

  const generated = process.argv.includes("--generate-password");
  const password = generated
    ? `${randomBytes(24).toString("base64url")}Aa1!`
    : await resolvePassword("Administrative password: ");
  validateAdministrativePassword(password);

  const admin = await admins.save(
    admins.create({
      login,
      passwordHash: await hashAdministrativePassword(password),
      displayName: readArgument("--display-name")?.trim() || login,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: new Date(),
      deactivatedAt: null,
      sessionVersion: 1,
      mfaMethod: "none",
      mfaEnrolledAt: null,
    }),
  );
  await audit("admin.created", admin.id, {
    source: "admin-cli",
  });

  process.stdout.write(`Administrator "${login}" created.\n`);
  if (generated) {
    process.stdout.write(`Generated password (shown once): ${password}\n`);
  }
}

async function deactivateAdmin(login: string): Promise<void> {
  const admin = await requireAdmin(login);
  if (!admin.isActive) {
    process.stdout.write(`Administrator "${login}" is already inactive.\n`);
    return;
  }

  admin.isActive = false;
  admin.deactivatedAt = new Date();
  admin.sessionVersion += 1;
  await AppDataSource.getRepository(AdminEntity).save(admin);
  await revokeSessions(login, "administrator deactivated", admin);
  await audit("admin.deactivated", admin.id, { source: "admin-cli" });
  process.stdout.write(`Administrator "${login}" deactivated.\n`);
}

async function changePassword(login: string): Promise<void> {
  const admin = await requireAdmin(login);
  const password = await resolvePassword("New administrative password: ");
  validateAdministrativePassword(password);
  admin.passwordHash = await hashAdministrativePassword(password);
  admin.passwordChangedAt = new Date();
  admin.sessionVersion += 1;
  admin.failedLoginAttempts = 0;
  admin.lockedUntil = null;
  await AppDataSource.getRepository(AdminEntity).save(admin);
  await revokeSessions(login, "administrator password changed", admin);
  await audit("admin.password_changed", admin.id, { source: "admin-cli" });
  process.stdout.write(`Password for "${login}" changed; sessions revoked.\n`);
}

async function revokeSessions(
  login: string,
  reason: string,
  existingAdmin?: AdminEntity,
): Promise<void> {
  const admin = existingAdmin ?? (await requireAdmin(login));
  const sessions = AppDataSource.getRepository(AuthSessionEntity);
  const activeSessions = await sessions.find({
    where: {
      principalType: SessionPrincipalType.ADMIN,
      principalId: admin.id,
      revokedAt: IsNull(),
    },
  });
  const revokedAt = new Date();
  for (const session of activeSessions) {
    session.revokedAt = revokedAt;
    session.revokeReason = reason;
  }
  if (activeSessions.length > 0) {
    await sessions.save(activeSessions);
    await AppDataSource.getRepository(RefreshTokenEntity).update(
      {
        tokenFamilyId: In(
          activeSessions.map((session) => session.tokenFamilyId),
        ),
        revokedAt: IsNull(),
      },
      { revokedAt },
    );
  }
  await audit("admin.sessions_revoked", admin.id, {
    source: "admin-cli",
    count: activeSessions.length,
  });
  process.stdout.write(
    `${activeSessions.length} active session(s) revoked for "${login}".\n`,
  );
}

async function showAdmin(login: string): Promise<void> {
  const admin = await requireAdmin(login);
  const activeSessionCount = await AppDataSource.getRepository(
    AuthSessionEntity,
  ).countBy({
    principalType: SessionPrincipalType.ADMIN,
    principalId: admin.id,
    revokedAt: IsNull(),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        login: admin.login,
        displayName: admin.displayName,
        active: admin.isActive,
        lockedUntil: admin.lockedUntil?.toISOString() ?? null,
        lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
        passwordChangedAt: admin.passwordChangedAt?.toISOString() ?? null,
        mfaMethod: admin.mfaMethod,
        activeSessionCount,
      },
      null,
      2,
    )}\n`,
  );
}

async function requireAdmin(login: string): Promise<AdminEntity> {
  const admin = await AppDataSource.getRepository(AdminEntity)
    .createQueryBuilder("admin")
    .addSelect("admin.passwordHash")
    .where("admin.login = :login", { login })
    .getOne();
  if (!admin) {
    throw new Error(`Administrator "${login}" does not exist`);
  }
  return admin;
}

async function audit(
  eventType: string,
  actorId: string,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  const events = AppDataSource.getRepository(SecurityAuditEventEntity);
  await events.save(
    events.create({
      eventType,
      actorType: SecurityActorType.ADMIN,
      actorId,
      outcome: SecurityAuditOutcome.SUCCESS,
      requestId: null,
      ipHash: null,
      metadata,
    }),
  );
}

async function resolveLogin(): Promise<string> {
  const provided = readArgument("--login")?.trim().toLowerCase();
  const raw = provided || (await promptVisible("Login: "));
  const normalized = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) {
    throw new Error(
      "Login must contain 3-64 lowercase letters, digits, dots, underscores or hyphens",
    );
  }
  return normalized;
}

async function resolvePassword(prompt: string): Promise<string> {
  if (process.argv.includes("--password-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks)
      .toString("utf8")
      .replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Use --generate-password or pipe a password with --password-stdin",
    );
  }
  return promptHidden(prompt);
}

async function promptVisible(prompt: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}

async function promptHidden(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });
  const readline = createInterface({ input: process.stdin, output });
  try {
    const answerPromise = readline.question(prompt);
    muted = true;
    const answer = await answerPromise;
    muted = false;
    process.stdout.write("\n");
    return answer;
  } finally {
    readline.close();
  }
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Admin command failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
