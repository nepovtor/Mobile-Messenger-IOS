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

@Entity()
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  messageID!: string;

  @Column()
  text!: string;

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
