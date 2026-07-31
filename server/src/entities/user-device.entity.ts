import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";
import { UserEntity } from "./user.entity";

export enum DevicePlatform {
  WEB = "web",
  IOS = "ios",
}

@Entity({ name: "user_devices" })
@Unique("uq_user_devices_user_uuid", ["userId", "deviceUuid"])
@Index("idx_user_devices_user_active", ["userId", "revokedAt"])
export class UserDeviceEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "device_uuid", type: "varchar", length: 128 })
  deviceUuid!: string;

  @Column({ name: "device_name", type: "varchar", length: 128 })
  deviceName!: string;

  @Column({ type: "simple-enum", enum: DevicePlatform })
  platform!: DevicePlatform;

  @Column({ name: "identity_public_key", type: "bytea" })
  identityPublicKey!: Buffer;

  @Column({ name: "signed_pre_key", type: "bytea" })
  signedPreKey!: Buffer;

  @Column({ name: "signed_pre_key_id", type: "integer" })
  signedPreKeyId!: number;

  @Column({ name: "signed_pre_key_signature", type: "bytea" })
  signedPreKeySignature!: Buffer;

  @Column({ name: "registration_id", type: "integer" })
  registrationId!: number;

  @Column({ name: "key_version", type: "integer", default: 1 })
  keyVersion!: number;

  @Column({
    name: "identity_changed_at",
    type: "timestamptz",
    nullable: true,
  })
  identityChangedAt!: Date | null;

  @Column({ name: "last_seen_at", type: "timestamptz" })
  lastSeenAt!: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
