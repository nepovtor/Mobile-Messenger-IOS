import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { ChatParticipantEntity } from "./chat-participant.entity";
import { createEntityId } from "./entity-id";
import { MessageEntity } from "./message.entity";

@Entity({ name: "chats" })
export class ChatEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ type: "varchar" })
  title!: string;

  @Column({ name: "last_message_id", type: "uuid", nullable: true })
  lastMessageId!: string | null;

  @ManyToOne(() => MessageEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "last_message_id" })
  lastMessage?: MessageEntity | null;

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
