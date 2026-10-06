import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { matrixConfig } from "./matrix.config";
import { MasAdminClient } from "./mas-admin.client";

type Job = {
  principal_id: string;
  generation: string;
  requested_at: Date;
  mas_lock_marker: string | null;
};
@Injectable()
export class MatrixRevocationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly config = matrixConfig();
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(private readonly database: DataSource) {}
  async onModuleInit() {
    if (!this.config) return;
    await this.database.query(
      "SELECT principal_id FROM matrix_lifecycle.revocation_outbox LIMIT 0",
    );
    this.timer = setInterval(() => {
      void this.drain();
    }, 1000);
    this.timer.unref();
    void this.drain();
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
  async drain(): Promise<void> {
    if (!this.config || this.stopping) return;
    if (this.running) return this.running;
    this.running = this.processOne().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async processOne(): Promise<void> {
    if (!this.config) return;
    const lease = randomUUID();
    // Row locks only cover lease acquisition, never a network request.
    let jobs: Job[];
    try {
      jobs = await this.database.query(
        `WITH candidate AS (
        SELECT principal_id FROM matrix_lifecycle.revocation_outbox
        WHERE generation > completed_generation AND next_attempt_at <= clock_timestamp()
          AND (lease_until IS NULL OR lease_until < clock_timestamp())
        ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1
      ), leased AS (UPDATE matrix_lifecycle.revocation_outbox o SET lease_id=$1,
        lease_until=clock_timestamp()+interval '30 seconds', attempts=attempts+1
        FROM candidate WHERE o.principal_id=candidate.principal_id RETURNING o.*)
      SELECT * FROM leased`,
        [lease],
      );
    } catch {
      return;
    } // Schema/runtime readiness fails admission checks closed.
    const job = jobs[0];
    if (!job) return;
    try {
      const admin = new MasAdminClient(this.config);
      const token = await admin.token();
      const user = await admin.findUser(job.principal_id, token);
      if (!user) {
        // An already-issued upstream identity can still provision a MAS account.
        // Keep admission closed beyond ID-token lifetime + clock skew.
        if (Date.now() - new Date(job.requested_at).getTime() < 360_000)
          throw new Error("Provisioning grace period");
      } else {
        const marker = await admin.lockUser(user.id, token);
        // Never take ownership of an external administrator's pre-existing lock.
        if (!user.lockedAt || user.lockedAt === job.mas_lock_marker) {
          await this.database.query(
            `UPDATE matrix_lifecycle.revocation_outbox SET mas_lock_marker=$1
            WHERE principal_id=$2 AND lease_id=$3`,
            [marker, job.principal_id, lease],
          );
        }
        await admin.finishSessions(user.id, token);
      }
      await this.database.query(
        `UPDATE matrix_lifecycle.revocation_outbox SET
        completed_generation=GREATEST(completed_generation,$1::bigint), lease_id=NULL, lease_until=NULL
        WHERE principal_id=$2 AND lease_id=$3`,
        [job.generation, job.principal_id, lease],
      );
    } catch {
      // No tokens, phone numbers, session IDs or remote responses enter logs.
      await this.database
        .query(
          `UPDATE matrix_lifecycle.revocation_outbox SET lease_id=NULL, lease_until=NULL,
        next_attempt_at=clock_timestamp()+interval '5 seconds' WHERE principal_id=$1 AND lease_id=$2`,
          [job.principal_id, lease],
        )
        .catch(() => undefined);
    }
  }
  async enqueue(
    subject: string,
    manager: EntityManager = this.database.manager,
  ): Promise<void> {
    if (!this.config) return;
    await manager.query(
      `INSERT INTO matrix_lifecycle.revocation_outbox(principal_id) VALUES ($1)
      ON CONFLICT (principal_id) DO UPDATE SET generation=matrix_lifecycle.revocation_outbox.generation+1,
        requested_at=clock_timestamp(), next_attempt_at=clock_timestamp(),
        quarantine_until=clock_timestamp()+interval '360 seconds'`,
      [subject],
    );
  }
  async authenticationNotBefore(subject: string): Promise<number | null> {
    if (!this.config) return null;
    const rows: { requested_at: Date }[] = await this.database.query(
      "SELECT requested_at FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1",
      [subject],
    );
    return rows[0]
      ? Math.floor(new Date(rows[0].requested_at).getTime() / 1000)
      : null;
  }
  private async state(subject: string): Promise<{
    pending: boolean;
    generation: string;
    marker: string | null;
    quarantineUntil: Date | null;
  }> {
    const rows: {
      pending: boolean;
      generation: string;
      mas_lock_marker: string | null;
      quarantine_until: Date;
    }[] = await this.database.query(
      `
      SELECT generation>completed_generation AS pending, generation, mas_lock_marker, quarantine_until
      FROM matrix_lifecycle.revocation_outbox WHERE principal_id=$1`,
      [subject],
    );
    return {
      pending: rows[0]?.pending ?? false,
      generation: rows[0]?.generation ?? "0",
      marker: rows[0]?.mas_lock_marker ?? null,
      quarantineUntil: rows[0]?.quarantine_until ?? null,
    };
  }
  async requireSettled(subject: string): Promise<void> {
    if (!this.config) return;
    await this.drain();
    if ((await this.state(subject)).pending)
      throw new ServiceUnavailableException(
        "Matrix revocation is pending; retry later",
      );
  }
  /** Only call after a newly consumed OTP; browser/refresh grants must not unlock. */
  async admitFreshLogin(subject: string): Promise<void> {
    if (!this.config) return;
    await this.requireSettled(subject);
    const before = await this.state(subject);
    if (!before.marker) return;
    // Signed upstream ID tokens cannot be retracted. Keep MAS locked through
    // their 300-second lifetime plus skew before a fresh OTP may unlock it.
    if (
      before.quarantineUntil &&
      Date.now() < new Date(before.quarantineUntil).getTime()
    )
      throw new ServiceUnavailableException(
        "Matrix login is quarantined after revocation; retry later",
      );
    const admin = new MasAdminClient(this.config);
    try {
      const token = await admin.token();
      const user = await admin.findUser(subject, token);
      if (!user) return;
      if (user.lockedAt && user.lockedAt !== before.marker)
        throw new Error("External MAS lock");
      if (user.lockedAt) await admin.unlockUser(user.id, token);
      const after = await this.state(subject);
      const accounts: { status: string }[] = await this.database.query(
        "SELECT status FROM users WHERE id=$1",
        [subject],
      );
      if (
        after.pending ||
        after.generation !== before.generation ||
        accounts[0]?.status !== "active"
      ) {
        await admin.lockUser(user.id, token);
        throw new Error("Account changed during admission");
      }
      await this.database.query(
        `UPDATE matrix_lifecycle.revocation_outbox SET mas_lock_marker=NULL
        WHERE principal_id=$1 AND generation=$2::bigint AND completed_generation=generation`,
        [subject, before.generation],
      );
    } catch {
      throw new ServiceUnavailableException(
        "Matrix login unavailable; retry later",
      );
    }
  }
}
