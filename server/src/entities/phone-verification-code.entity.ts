import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";

@Entity({ name: "phone_verification_codes" })
@Index(["phone", "createdAt"])
export class PhoneVerificationCodeEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

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

  @Column({
    name: "request_ip_hash",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  requestIPHash!: string | null;

  @Column({
    name: "device_identifier_hash",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  deviceIdentifierHash!: string | null;
}
