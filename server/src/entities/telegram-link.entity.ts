import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";
import { UserEntity } from "./user.entity";

export enum TelegramLinkState {
  PENDING = "pending",
  LINKED = "linked",
}

@Entity({ name: "telegram_links" })
@Check(
  "CHK_telegram_links_state_owner",
  `("state" = 'pending' AND "user_id" IS NULL) OR ("state" = 'linked' AND "user_id" IS NOT NULL)`,
)
export class TelegramLinkEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity | null;

  // A pending link is intentionally unowned until phone verification creates
  // or locates the account. A linked record must always have a userId.
  @Column({
    type: "simple-enum",
    enum: TelegramLinkState,
    default: TelegramLinkState.PENDING,
  })
  state!: TelegramLinkState;

  @Column({ type: "varchar", unique: true })
  phone!: string;

  @Column({ name: "chat_id", type: "varchar" })
  chatId!: string;

  @Column({ name: "telegram_user_id", type: "varchar", nullable: true })
  telegramUserId!: string | null;

  @Column({ type: "varchar", nullable: true })
  username!: string | null;

  @Column({ name: "first_name", type: "varchar", nullable: true })
  firstName!: string | null;

  @CreateDateColumn({ name: "linked_at", type: "timestamptz" })
  linkedAt!: Date;

  @Column({ name: "last_verified_at", type: "timestamptz", nullable: true })
  lastVerifiedAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
