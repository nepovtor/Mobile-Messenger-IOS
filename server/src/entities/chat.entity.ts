import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { ChatParticipantEntity } from "./chat-participant.entity";
import { MessageEntity } from "./message.entity";

@Entity({ name: "chats" })
export class ChatEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ type: "varchar" })
  title!: string;

  @Column({ name: "last_message_preview", type: "varchar", nullable: true })
  lastMessagePreview!: string | null;

  @Column({
    name: "last_activity",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  lastActivity!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => ChatParticipantEntity, (participant) => participant.chat)
  participants?: ChatParticipantEntity[];

  @OneToMany(() => MessageEntity, (message) => message.chat)
  messages?: MessageEntity[];
}
