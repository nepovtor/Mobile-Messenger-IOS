import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

@Entity({ name: "phone_verification_codes" })
@Index(["phone", "createdAt"])
export class PhoneVerificationCodeEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ type: "varchar" })
  phone!: string;

  @Column({ name: "code_hash", type: "varchar" })
  codeHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ name: "consumed_at", type: "timestamptz", nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "resend_available_at", type: "timestamptz" })
  resendAvailableAt!: Date;

  @Column({ name: "request_ip", type: "varchar", nullable: true })
  requestIP!: string | null;

  @Column({ name: "user_agent", type: "varchar", nullable: true })
  userAgent!: string | null;
}
