import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({ name: "contacts" })
@Unique("uq_contacts_owner_contact", ["ownerUserId", "contactUserId"])
export class ContactEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ name: "owner_user_id", type: "uuid" })
  ownerUserId!: string;

  @ManyToOne(() => UserEntity, (user) => user.ownedContacts, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "owner_user_id" })
  ownerUser!: UserEntity;

  @Column({ name: "contact_user_id", type: "uuid" })
  contactUserId!: string;

  @ManyToOne(() => UserEntity, (user) => user.contactOfUsers, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "contact_user_id" })
  contactUser!: UserEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
