import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { createEntityId } from "./entity-id";

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
@Check(
  "CHK_push_subscriptions_payload",
  `(
    (platform = 'web' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL AND device_token IS NULL AND environment IS NULL AND bundle_id IS NULL)
    OR
    (platform = 'ios' AND endpoint IS NULL AND p256dh IS NULL AND auth IS NULL AND device_token IS NOT NULL AND environment IS NOT NULL AND bundle_id IS NOT NULL)
  )`,
)
export class PushSubscriptionEntity {
  @PrimaryColumn("uuid")
  id = createEntityId();

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
