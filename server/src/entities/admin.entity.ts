import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";

@Entity({ name: "admins" })
export class AdminEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ type: "varchar", unique: true })
  login!: string;

  @Column({ name: "password_hash", type: "varchar", select: false })
  passwordHash!: string;

  @Column({ name: "display_name", type: "varchar", default: "Administrator" })
  displayName!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "failed_login_attempts", type: "integer", default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: "locked_until", type: "timestamptz", nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: "password_changed_at", type: "timestamptz", nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ name: "deactivated_at", type: "timestamptz", nullable: true })
  deactivatedAt!: Date | null;

  @Column({ name: "session_version", type: "integer", default: 1 })
  sessionVersion!: number;

  @Column({ name: "mfa_method", type: "varchar", default: "none" })
  mfaMethod!: "none" | "totp";

  @Column({ name: "mfa_enrolled_at", type: "timestamptz", nullable: true })
  mfaEnrolledAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
