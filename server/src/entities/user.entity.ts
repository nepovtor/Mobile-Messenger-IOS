import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { ChatParticipantEntity } from "./chat-participant.entity";
import { MediaEntity } from "./media.entity";
import { MessageEntity } from "./message.entity";

export enum AuthMethod {
  PHONE = "phone",
  EMAIL = "email",
}

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ type: "simple-enum", enum: AuthMethod })
  method!: AuthMethod;

  @Column({ type: "varchar", unique: true })
  contact!: string;

  @Column({ type: "varchar", unique: true, nullable: true })
  phone!: string | null;

  @Column({ name: "telegram_chat_id", type: "varchar", nullable: true })
  telegramChatId!: string | null;

  @Column({ name: "telegram_username", type: "varchar", nullable: true })
  telegramUsername!: string | null;

  @Column({ name: "display_name", type: "varchar" })
  displayName!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => ChatParticipantEntity, (participant) => participant.user)
  chatParticipants?: ChatParticipantEntity[];

  @OneToMany(() => MessageEntity, (message) => message.author)
  messages?: MessageEntity[];

  @OneToMany(() => MediaEntity, (media) => media.uploadedBy)
  uploadedMedia?: MediaEntity[];
}
