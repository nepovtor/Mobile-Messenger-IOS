import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";
import { UserEntity } from "./user.entity";

export enum EncryptedAttachmentStatus {
  PENDING = "pending",
  UPLOADED = "uploaded",
  EXPIRED = "expired",
}

@Entity({ name: "encrypted_attachments" })
@Index("idx_encrypted_attachments_pending_expiry", ["status", "expiresAt"])
export class EncryptedAttachmentEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "object_key", type: "varchar", unique: true })
  objectKey!: string;

  @Column({ name: "uploaded_by_id", type: "uuid" })
  uploadedById!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "uploaded_by_id" })
  uploadedBy!: UserEntity;

  @Column({ name: "size_bytes", type: "integer" })
  sizeBytes!: number;

  @Column({ name: "ciphertext_hash", type: "varchar", length: 64 })
  ciphertextHash!: string;

  @Column({
    type: "simple-enum",
    enum: EncryptedAttachmentStatus,
    default: EncryptedAttachmentStatus.PENDING,
  })
  status!: EncryptedAttachmentStatus;

  @Column({ name: "uploaded_at", type: "timestamptz", nullable: true })
  uploadedAt!: Date | null;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
