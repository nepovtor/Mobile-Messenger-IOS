import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { ChatEntity } from "./chat.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "chat_participants" })
@Unique("uq_chat_participants_chat_user", ["chatId", "userId"])
export class ChatParticipantEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

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

  @Column({ name: "last_read_at", type: "timestamptz", nullable: true })
  lastReadAt!: Date | null;

  @CreateDateColumn({ name: "joined_at", type: "timestamptz" })
  joinedAt!: Date;
}
