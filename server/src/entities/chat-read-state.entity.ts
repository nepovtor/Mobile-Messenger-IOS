import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { ChatEntity } from "./chat.entity";
import { UserEntity } from "./user.entity";

@Entity()
@Unique(["chat", "user"])
export class ChatReadState {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => ChatEntity, { onDelete: "CASCADE" })
  @JoinColumn()
  chat!: ChatEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn()
  user!: UserEntity;

  @Column({ type: "datetime", nullable: true })
  lastReadAt!: Date | null;

  @Column({ type: "text", nullable: true })
  lastReadMessageID!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
