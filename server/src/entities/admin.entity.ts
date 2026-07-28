import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { createEntityId } from "./entity-id";

@Entity({ name: "admins" })
export class AdminEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

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
