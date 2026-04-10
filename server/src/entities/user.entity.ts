import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
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

  @Column({ type: "enum", enum: AuthMethod })
  method!: AuthMethod;

  @Column({ type: "varchar", unique: true })
  contact!: string;

  @Column({ name: "display_name", type: "varchar" })
  displayName!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => ChatParticipantEntity, (participant) => participant.user)
  chatParticipants?: ChatParticipantEntity[];

  @OneToMany(() => MessageEntity, (message) => message.author)
  messages?: MessageEntity[];

  @OneToMany(() => MediaEntity, (media) => media.uploadedBy)
  uploadedMedia?: MediaEntity[];
}
