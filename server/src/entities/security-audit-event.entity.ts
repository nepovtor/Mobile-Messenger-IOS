import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";

export enum SecurityActorType {
  ANONYMOUS = "anonymous",
  USER = "user",
  ADMIN = "admin",
  SYSTEM = "system",
}

export enum SecurityAuditOutcome {
  SUCCESS = "success",
  FAILURE = "failure",
  DENIED = "denied",
}

@Entity({ name: "security_audit_events" })
@Index("idx_security_audit_events_type_created", ["eventType", "createdAt"])
@Index("idx_security_audit_events_actor_created", ["actorId", "createdAt"])
export class SecurityAuditEventEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "event_type", type: "varchar", length: 100 })
  eventType!: string;

  @Column({
    name: "actor_type",
    type: "simple-enum",
    enum: SecurityActorType,
  })
  actorType!: SecurityActorType;

  @Column({ name: "actor_id", type: "varchar", nullable: true })
  actorId!: string | null;

  @Column({
    type: "simple-enum",
    enum: SecurityAuditOutcome,
  })
  outcome!: SecurityAuditOutcome;

  @Column({ name: "request_id", type: "varchar", nullable: true })
  requestId!: string | null;

  @Column({ name: "ip_hash", type: "varchar", length: 64, nullable: true })
  ipHash!: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metadata!: Record<string, string | number | boolean | null>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
