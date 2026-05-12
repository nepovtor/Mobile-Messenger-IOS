import { hashSync } from "bcryptjs";
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialLabComplianceMigration20260512000000 implements MigrationInterface {
  name = "InitialLabComplianceMigration20260512000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admins" (
        "id" uuid NOT NULL,
        "login" character varying NOT NULL,
        "password_hash" character varying NOT NULL,
        "display_name" character varying NOT NULL DEFAULT 'Administrator',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admins_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admins_login" UNIQUE ("login")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL,
        "method" character varying NOT NULL,
        "contact" character varying NOT NULL,
        "login" character varying,
        "phone" character varying,
        "password_hash" character varying,
        "telegram_chat_id" character varying,
        "telegram_username" character varying,
        "display_name" character varying NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_users_method" CHECK ("method" IN ('phone', 'email')),
        CONSTRAINT "UQ_users_contact" UNIQUE ("contact"),
        CONSTRAINT "UQ_users_login" UNIQUE ("login"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "phone_verification_codes" (
        "id" uuid NOT NULL,
        "phone" character varying NOT NULL,
        "code_hash" character varying NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "consumed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "resend_available_at" TIMESTAMPTZ NOT NULL,
        "request_ip" character varying,
        "user_agent" character varying,
        CONSTRAINT "PK_phone_verification_codes_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_phone_verification_codes_phone_created_at"
      ON "phone_verification_codes" ("phone", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_links" (
        "id" uuid NOT NULL,
        "phone" character varying NOT NULL,
        "chat_id" character varying NOT NULL,
        "telegram_user_id" character varying,
        "username" character varying,
        "first_name" character varying,
        "linked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_verified_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telegram_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_telegram_links_phone" UNIQUE ("phone")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_pairing_tokens" (
        "id" uuid NOT NULL,
        "token_hash" character varying NOT NULL,
        "phone" character varying NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "chat_id" character varying,
        "telegram_user_id" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "attempts" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_telegram_pairing_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_telegram_pairing_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_pairing_tokens_phone_created_at"
      ON "telegram_pairing_tokens" ("phone", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_pairing_tokens_chat_user_created_at"
      ON "telegram_pairing_tokens" ("chat_id", "telegram_user_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chats" (
        "id" uuid NOT NULL,
        "title" character varying NOT NULL,
        "last_message_preview" character varying,
        "last_activity" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chats_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "location_shares" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "latitude" double precision,
        "longitude" double precision,
        "accuracy" double precision,
        "sharing_enabled" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_location_shares_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_location_shares_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_location_shares_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "media" (
        "id" uuid NOT NULL,
        "object_key" character varying NOT NULL,
        "mime_type" character varying NOT NULL,
        "size_bytes" integer NOT NULL,
        "width" integer,
        "height" integer,
        "uploaded_by_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_media_status" CHECK ("status" IN ('pending', 'uploaded')),
        CONSTRAINT "UQ_media_object_key" UNIQUE ("object_key"),
        CONSTRAINT "FK_media_uploaded_by_id" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_participants" (
        "id" uuid NOT NULL,
        "chat_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "last_read_message_id" uuid,
        "last_read_at" TIMESTAMPTZ,
        "hidden_at" TIMESTAMPTZ,
        "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_participants_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_participants_chat_user" UNIQUE ("chat_id", "user_id"),
        CONSTRAINT "FK_chat_participants_chat_id" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_participants_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" uuid NOT NULL,
        "chat_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "client_message_id" uuid NOT NULL,
        "kind" character varying NOT NULL DEFAULT 'text',
        "text" text,
        "media_id" uuid,
        "status" character varying NOT NULL DEFAULT 'sent',
        "edited_at" TIMESTAMPTZ,
        "deleted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_messages_kind" CHECK ("kind" IN ('text', 'image')),
        CONSTRAINT "CHK_messages_status" CHECK ("status" IN ('sending', 'sent', 'delivered', 'read', 'failed')),
        CONSTRAINT "FK_messages_chat_id" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_media_id" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "contact_user_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contacts_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_contacts_owner_contact" UNIQUE ("owner_user_id", "contact_user_id"),
        CONSTRAINT "FK_contacts_owner_user_id" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_contacts_contact_user_id" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "platform" character varying NOT NULL,
        "endpoint" text,
        "p256dh" text,
        "auth" text,
        "user_agent" text,
        "device_token" character varying,
        "environment" character varying,
        "bundle_id" character varying,
        "disabled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_push_subscriptions_platform" CHECK ("platform" IN ('web', 'ios')),
        CONSTRAINT "CHK_push_subscriptions_environment" CHECK ("environment" IS NULL OR "environment" IN ('sandbox', 'production')),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "UQ_push_subscriptions_device_token" UNIQUE ("device_token"),
        CONSTRAINT "FK_push_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user_platform"
      ON "push_subscriptions" ("user_id", "platform")
    `);

    await queryRunner.query(
      `
        INSERT INTO "admins" ("id", "login", "password_hash", "display_name")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("login") DO NOTHING
      `,
      [
        "00000000-0000-0000-0000-000000000001",
        "admin",
        hashSync("admin", 12),
        "Administrator",
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_push_subscriptions_user_platform"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "location_shares"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chats"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_pairing_tokens_chat_user_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_pairing_tokens_phone_created_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_pairing_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_links"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_phone_verification_codes_phone_created_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "phone_verification_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admins"`);
  }
}
