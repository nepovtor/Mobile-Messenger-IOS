import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { createEntityId } from "./entity-id";

@Entity({ name: "location_shares" })
export class LocationShareEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "user_id", type: "uuid", unique: true })
  userId!: string;

  @Column({ type: "double precision", nullable: true })
  latitude!: number | null;

  @Column({ type: "double precision", nullable: true })
  longitude!: number | null;

  @Column({ type: "double precision", nullable: true })
  accuracy!: number | null;

  @Column({ name: "sharing_enabled", type: "boolean", default: false })
  sharingEnabled!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;
}
