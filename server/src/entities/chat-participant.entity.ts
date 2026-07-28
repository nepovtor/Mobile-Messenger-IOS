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
import { ChatEntity } from "./chat.entity";
import { createEntityId } from "./entity-id";
import { MessageEntity } from "./message.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "chat_participants" })
@Unique("uq_chat_participants_chat_user", ["chatId", "userId"])
@Index("idx_chat_participants_user_chat", ["userId", "chatId"])
export class ChatParticipantEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "chat_id", type: "uuid" })
  chatId!: string;

  @ManyToOne(() => ChatEntity, (chat) => chat.participants, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "chat_id" })
  chat!: ChatEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.chatParticipants, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "last_read_message_id", type: "uuid", nullable: true })
  lastReadMessageId!: string | null;

  @ManyToOne(() => MessageEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "last_read_message_id" })
  lastReadMessage?: MessageEntity | null;

  @Column({ name: "last_read_at", type: "timestamptz", nullable: true })
  lastReadAt!: Date | null;

  @Column({ name: "hidden_at", type: "timestamptz", nullable: true })
  hiddenAt!: Date | null;

  @CreateDateColumn({ name: "joined_at", type: "timestamptz" })
  joinedAt!: Date;
}
