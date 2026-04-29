import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "telegram_links" })
export class TelegramLinkEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ type: "varchar", unique: true })
  phone!: string;

  @Column({ name: "chat_id", type: "varchar" })
  chatId!: string;

  @Column({ type: "varchar", nullable: true })
  username!: string | null;

  @Column({ name: "first_name", type: "varchar", nullable: true })
  firstName!: string | null;

  @CreateDateColumn({ name: "linked_at", type: "timestamptz" })
  linkedAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
