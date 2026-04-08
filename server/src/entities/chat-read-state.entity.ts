import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Chat } from "./chat.entity";
import { User } from "./user.entity";

@Entity()
@Unique(["chat", "user"])
export class ChatReadState {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn()
  chat!: Chat;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn()
  user!: User;

  @Column({ type: "datetime", nullable: true })
  lastReadAt!: Date | null;

  @Column({ type: "text", nullable: true })
  lastReadMessageID!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
