import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";

export enum SessionPrincipalType {
  USER = "user",
  ADMIN = "admin",
}

export enum SessionPlatform {
  WEB = "web",
  IOS = "ios",
  CLI = "cli",
  UNKNOWN = "unknown",
}

@Entity({ name: "auth_sessions" })
@Index("idx_auth_sessions_principal_active", [
  "principalType",
  "principalId",
  "revokedAt",
])
@Index("idx_auth_sessions_family", ["tokenFamilyId"])
export class AuthSessionEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({
    name: "principal_type",
    type: "simple-enum",
    enum: SessionPrincipalType,
  })
  principalType!: SessionPrincipalType;

  @Column({ name: "principal_id", type: "uuid" })
  principalId!: string;

  @Column({ name: "token_family_id", type: "uuid", unique: true })
  tokenFamilyId = createEntityId();

  @Column({ name: "device_uuid", type: "varchar", length: 128 })
  deviceUuid!: string;

  @Column({ name: "device_name", type: "varchar", length: 128 })
  deviceName!: string;

  @Column({
    type: "simple-enum",
    enum: SessionPlatform,
    default: SessionPlatform.UNKNOWN,
  })
  platform!: SessionPlatform;

  @Column({ name: "ip_hash", type: "varchar", length: 64, nullable: true })
  ipHash!: string | null;

  @Column({
    name: "user_agent_hash",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  userAgentHash!: string | null;

  @Column({ name: "last_seen_at", type: "timestamptz" })
  lastSeenAt!: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ name: "revoke_reason", type: "varchar", nullable: true })
  revokeReason!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
