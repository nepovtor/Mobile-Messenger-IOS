import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { ChatEntity } from "./chat.entity";
import { createEntityId } from "./entity-id";
import { MediaEntity } from "./media.entity";
import { UserEntity } from "./user.entity";

export enum MessageStatus {
  SENDING = "sending",
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
}

export enum MessageKind {
  TEXT = "text",
  IMAGE = "image",
}

@Entity({ name: "messages" })
@Index("idx_messages_chat_created_id", ["chatId", "createdAt", "id"])
@Unique("uq_messages_legacy_idempotency", [
  "chatId",
  "authorId",
  "clientMessageId",
])
export class MessageEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "chat_id", type: "uuid" })
  chatId!: string;

  @ManyToOne(() => ChatEntity, (chat) => chat.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chat_id" })
  chat!: ChatEntity;

  @Column({ name: "author_id", type: "uuid" })
  authorId!: string;

  @ManyToOne(() => UserEntity, (user) => user.messages, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "author_id" })
  author!: UserEntity;

  @Column({ name: "client_message_id", type: "uuid" })
  clientMessageId!: string;

  @Column({ type: "simple-enum", enum: MessageKind, default: MessageKind.TEXT })
  kind!: MessageKind;

  @Column({ type: "text", nullable: true })
  text!: string | null;

  @Column({ name: "media_id", type: "uuid", nullable: true })
  mediaId!: string | null;

  @ManyToOne(() => MediaEntity, (media) => media.messages, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "media_id" })
  media!: MediaEntity | null;

  @Column({
    type: "simple-enum",
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  status!: MessageStatus;

  @Column({ name: "edited_at", type: "timestamptz", nullable: true })
  editedAt!: Date | null;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @Column({ name: "is_legacy", type: "boolean", default: true })
  isLegacy!: boolean;

  @Column({ name: "migrated_at", type: "timestamptz", nullable: true })
  migratedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
