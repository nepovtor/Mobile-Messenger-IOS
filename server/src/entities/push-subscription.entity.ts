import { randomUUID } from "node:crypto";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

export enum PushPlatform {
  WEB = "web",
  IOS = "ios",
}

export enum PushEnvironment {
  SANDBOX = "sandbox",
  PRODUCTION = "production",
}

@Entity({ name: "push_subscriptions" })
@Index("idx_push_subscriptions_user_platform", ["userId", "platform"])
export class PushSubscriptionEntity {
  @PrimaryColumn("uuid")
  id = randomUUID();

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.pushSubscriptions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "simple-enum", enum: PushPlatform })
  platform!: PushPlatform;

  @Column({ type: "text", nullable: true, unique: true })
  endpoint!: string | null;

  @Column({ type: "text", nullable: true })
  p256dh!: string | null;

  @Column({ type: "text", nullable: true })
  auth!: string | null;

  @Column({ name: "user_agent", type: "text", nullable: true })
  userAgent!: string | null;

  @Column({
    name: "device_token",
    type: "varchar",
    nullable: true,
    unique: true,
  })
  deviceToken!: string | null;

  @Column({
    type: "simple-enum",
    enum: PushEnvironment,
    nullable: true,
  })
  environment!: PushEnvironment | null;

  @Column({ name: "bundle_id", type: "varchar", nullable: true })
  bundleId!: string | null;

  @Column({ name: "disabled_at", type: "timestamptz", nullable: true })
  disabledAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
