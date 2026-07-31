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
import { createEntityId } from "./entity-id";
import { UserEntity } from "./user.entity";

export enum ContactRequestStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  BLOCKED = "blocked",
  REJECTED = "rejected",
}

@Entity({ name: "contact_requests" })
@Unique("uq_contact_requests_pair", ["pairKey"])
@Index("idx_contact_requests_recipient_status", ["recipientUserId", "status"])
@Index("idx_contact_requests_requester_status", ["requesterUserId", "status"])
export class ContactRequestEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

  @Column({ name: "pair_key", type: "varchar", length: 73 })
  pairKey!: string;

  @Column({ name: "requester_user_id", type: "uuid" })
  requesterUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requester_user_id" })
  requesterUser!: UserEntity;

  @Column({ name: "recipient_user_id", type: "uuid" })
  recipientUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recipient_user_id" })
  recipientUser!: UserEntity;

  @Column({
    type: "simple-enum",
    enum: ContactRequestStatus,
    default: ContactRequestStatus.PENDING,
  })
  status!: ContactRequestStatus;

  @Column({ name: "blocked_by_user_id", type: "uuid", nullable: true })
  blockedByUserId!: string | null;

  @Column({ name: "responded_at", type: "timestamptz", nullable: true })
  respondedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
