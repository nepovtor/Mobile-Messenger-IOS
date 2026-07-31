import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { AuthSessionEntity } from "./auth-session.entity";
import { createEntityId } from "./entity-id";

@Entity({ name: "refresh_tokens" })
@Index("idx_refresh_tokens_session_created", ["sessionId", "createdAt"])
@Index("idx_refresh_tokens_family", ["tokenFamilyId"])
export class RefreshTokenEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "session_id", type: "uuid" })
  sessionId!: string;

  @ManyToOne(() => AuthSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session!: AuthSessionEntity;

  @Column({ name: "token_family_id", type: "uuid" })
  tokenFamilyId!: string;

  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash!: string;

  @Column({ name: "parent_token_id", type: "uuid", nullable: true })
  parentTokenId!: string | null;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "consumed_at", type: "timestamptz", nullable: true })
  consumedAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ name: "replaced_by_token_id", type: "uuid", nullable: true })
  replacedByTokenId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
