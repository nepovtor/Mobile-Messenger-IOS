import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity()
export class Chat {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  title!: string;

  @Column({ type: "text", nullable: true })
  lastMessagePreview!: string;

  @Column({ type: "datetime", nullable: true })
  lastActivity!: Date | null;

  @Column({ default: false })
  isDirect!: boolean;

  @ManyToMany(() => User)
  @JoinTable()
  participants!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
