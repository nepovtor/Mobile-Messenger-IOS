import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";

@Entity({ name: "telegram_pairing_tokens" })
@Index(["phone", "createdAt"])
@Index(["chatId", "telegramUserId", "createdAt"])
export class TelegramPairingTokenEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "token_hash", type: "varchar", unique: true })
  tokenHash!: string;

  @Column({ type: "varchar" })
  phone!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "consumed_at", type: "timestamptz", nullable: true })
  consumedAt!: Date | null;

  @Column({ name: "chat_id", type: "varchar", nullable: true })
  chatId!: string | null;

  @Column({ name: "telegram_user_id", type: "varchar", nullable: true })
  telegramUserId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "int", default: 0 })
  attempts!: number;
}
