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
import { EncryptedMessageEntity } from "./encrypted-message.entity";
import { UserDeviceEntity } from "./user-device.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "encrypted_message_envelopes" })
@Unique("uq_encrypted_envelopes_message_device", [
  "messageId",
  "recipientDeviceId",
])
@Index("idx_encrypted_envelopes_recipient_delivery", [
  "recipientDeviceId",
  "deliveredAt",
  "createdAt",
])
export class EncryptedMessageEnvelopeEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "message_id", type: "uuid" })
  messageId!: string;

  @ManyToOne(() => EncryptedMessageEntity, (message) => message.envelopes, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "message_id" })
  message!: EncryptedMessageEntity;

  @Column({ name: "recipient_user_id", type: "uuid" })
  recipientUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recipient_user_id" })
  recipientUser!: UserEntity;

  @Column({ name: "recipient_device_id", type: "uuid" })
  recipientDeviceId!: string;

  @ManyToOne(() => UserDeviceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recipient_device_id" })
  recipientDevice!: UserDeviceEntity;

  @Column({ name: "envelope_type", type: "varchar", length: 32 })
  envelopeType!: string;

  @Column({ type: "bytea" })
  ciphertext!: Buffer;

  @Column({ name: "encrypted_header", type: "bytea" })
  encryptedHeader!: Buffer;

  @Column({ name: "delivered_at", type: "timestamptz", nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
