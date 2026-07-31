import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { ContactRequestEntity } from "./contact-request.entity";
import { createEntityId } from "./entity-id";
import { UserEntity } from "./user.entity";

export enum LocationPermissionStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

@Entity({ name: "location_permissions" })
@Unique("uq_location_permissions_owner_grantee", [
  "ownerUserId",
  "granteeUserId",
])
@Index("idx_location_permissions_grantee_active", [
  "granteeUserId",
  "status",
  "expiresAt",
])
export class LocationPermissionEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "owner_user_id", type: "uuid" })
  ownerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_user_id" })
  ownerUser!: UserEntity;

  @Column({ name: "grantee_user_id", type: "uuid" })
  granteeUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "grantee_user_id" })
  granteeUser!: UserEntity;

  @Column({ name: "contact_request_id", type: "uuid" })
  contactRequestId!: string;

  @ManyToOne(() => ContactRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contact_request_id" })
  contactRequest!: ContactRequestEntity;

  @Column({
    type: "simple-enum",
    enum: LocationPermissionStatus,
  })
  status!: LocationPermissionStatus;

  @Column({ name: "granted_at", type: "timestamptz" })
  grantedAt!: Date;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
