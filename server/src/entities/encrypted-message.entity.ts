import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { ChatEntity } from "./chat.entity";
import { createEntityId } from "./entity-id";
import { EncryptedMessageEnvelopeEntity } from "./encrypted-message-envelope.entity";
import { UserDeviceEntity } from "./user-device.entity";
import { UserEntity } from "./user.entity";

export enum EncryptedMessageType {
  TEXT = "text",
  EDIT = "edit",
  DELETE = "delete",
  REACTION = "reaction",
  ATTACHMENT = "attachment",
  LOCATION = "location",
  SYSTEM = "system",
}

@Entity({ name: "encrypted_messages" })
@Unique("uq_encrypted_messages_idempotency", [
  "chatId",
  "senderDeviceId",
  "idempotencyKey",
])
@Index("idx_encrypted_messages_chat_received", [
  "chatId",
  "serverReceivedAt",
  "id",
])
export class EncryptedMessageEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "chat_id", type: "uuid" })
  chatId!: string;

  @ManyToOne(() => ChatEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat!: ChatEntity;

  @Column({ name: "sender_user_id", type: "uuid" })
  senderUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "sender_user_id" })
  senderUser!: UserEntity;

  @Column({ name: "sender_device_id", type: "uuid" })
  senderDeviceId!: string;

  @ManyToOne(() => UserDeviceEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "sender_device_id" })
  senderDevice!: UserDeviceEntity;

  @Column({ name: "protocol_version", type: "varchar", length: 32 })
  protocolVersion!: string;

  @Column({
    name: "message_type",
    type: "simple-enum",
    enum: EncryptedMessageType,
  })
  messageType!: EncryptedMessageType;

  @Column({ name: "target_message_id", type: "uuid", nullable: true })
  targetMessageId!: string | null;

  @Column({ name: "client_timestamp", type: "timestamptz" })
  clientTimestamp!: Date;

  @CreateDateColumn({
    name: "server_received_at",
    type: "timestamptz",
  })
  serverReceivedAt!: Date;

  @Column({ name: "idempotency_key", type: "uuid" })
  idempotencyKey!: string;

  @Column({ name: "membership_epoch", type: "integer", default: 1 })
  membershipEpoch!: number;

  @Column({ name: "ciphertext_size", type: "integer" })
  ciphertextSize!: number;

  @OneToMany(
    () => EncryptedMessageEnvelopeEntity,
    (envelope) => envelope.message,
  )
  envelopes?: EncryptedMessageEnvelopeEntity[];
}
