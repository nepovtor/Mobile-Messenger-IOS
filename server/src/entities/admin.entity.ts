import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "admins" })
export class AdminEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ type: "varchar", unique: true })
  login!: string;

  @Column({ name: "password_hash", type: "varchar", select: false })
  passwordHash!: string;

  @Column({ name: "display_name", type: "varchar", default: "Administrator" })
  displayName!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
