import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Chat } from "./chat.entity";
import { User } from "./user.entity";

export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type MessageKind = "text" | "image";

@Entity()
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  messageID!: string;

  @Column({
    type: "simple-enum",
    enum: ["text", "image"],
    default: "text",
  })
  kind!: MessageKind;

  @Column({ default: "" })
  text!: string;

  @Column({ type: "varchar", nullable: true })
  mediaID!: string | null;

  @Column({ type: "varchar", nullable: true })
  mediaURL!: string | null;

  @ManyToOne(() => User)
  @JoinColumn()
  author!: User;

  @ManyToOne(() => Chat)
  @JoinColumn()
  chat!: Chat;

  @Column({ type: "datetime" })
  createdAt!: Date;

  @Column({
    type: "simple-enum",
    enum: ["sending", "sent", "delivered", "read", "failed"],
  })
  status!: MessageStatus;
}
