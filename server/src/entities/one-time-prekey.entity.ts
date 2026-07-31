import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { createEntityId } from "./entity-id";
import { UserDeviceEntity } from "./user-device.entity";

@Entity({ name: "one_time_prekeys" })
@Unique("uq_one_time_prekeys_device_key", ["deviceId", "keyId"])
@Index("idx_one_time_prekeys_available", ["deviceId", "claimedAt", "keyId"])
export class OneTimePreKeyEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @ManyToOne(() => UserDeviceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "device_id" })
  device!: UserDeviceEntity;

  @Column({ name: "key_id", type: "integer" })
  keyId!: number;

  @Column({ name: "public_key", type: "bytea" })
  publicKey!: Buffer;

  @Column({ name: "claimed_at", type: "timestamptz", nullable: true })
  claimedAt!: Date | null;

  @Column({ name: "claimed_by_device_id", type: "uuid", nullable: true })
  claimedByDeviceId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
