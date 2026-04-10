import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { MessageEntity } from "./message.entity";
import { UserEntity } from "./user.entity";

export enum MediaStatus {
  PENDING = "pending",
  UPLOADED = "uploaded",
}

@Entity({ name: "media" })
export class MediaEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ name: "object_key", type: "varchar", unique: true })
  objectKey!: string;

  @Column({ name: "mime_type", type: "varchar" })
  mimeType!: string;

  @Column({ name: "size_bytes", type: "integer" })
  sizeBytes!: number;

  @Column({ type: "integer", nullable: true })
  width!: number | null;

  @Column({ type: "integer", nullable: true })
  height!: number | null;

  @Column({ name: "uploaded_by_id", type: "uuid" })
  uploadedById!: string;

  @ManyToOne(() => UserEntity, (user) => user.uploadedMedia, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "uploaded_by_id" })
  uploadedBy!: UserEntity;

  @Column({ type: "enum", enum: MediaStatus, default: MediaStatus.PENDING })
  status!: MediaStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => MessageEntity, (message) => message.media)
  messages?: MessageEntity[];
}
