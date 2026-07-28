import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatReferencesAndPushIntegrity20260729120000 implements MigrationInterface {
  name = "ChatReferencesAndPushIntegrity20260729120000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chats"
      ADD COLUMN IF NOT EXISTS "last_message_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "chats" AS chat
      SET "last_message_id" = (
        SELECT "id"
        FROM "messages"
        WHERE "chat_id" = chat."id"
        ORDER BY "created_at" DESC, "id" DESC
        LIMIT 1
      )
      WHERE chat."last_message_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "chats"
      ADD CONSTRAINT "FK_chats_last_message_id"
      FOREIGN KEY ("last_message_id") REFERENCES "messages"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "chats"
      DROP COLUMN IF EXISTS "last_message_preview"
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      ADD COLUMN IF NOT EXISTS "user_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "telegram_links" AS link
      SET "user_id" = user_account."id"
      FROM "users" AS user_account
      WHERE link."user_id" IS NULL
        AND link."phone" = user_account."phone"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      ADD COLUMN IF NOT EXISTS "state" character varying NOT NULL DEFAULT 'pending'
    `);
    await queryRunner.query(`
      UPDATE "telegram_links"
      SET "state" = 'linked'
      WHERE "user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      ADD CONSTRAINT "FK_telegram_links_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON UPDATE CASCADE ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      ADD CONSTRAINT "CHK_telegram_links_state_owner"
      CHECK (
        ("state" = 'pending' AND "user_id" IS NULL)
        OR ("state" = 'linked' AND "user_id" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "chat_participants"
      ADD CONSTRAINT "FK_chat_participants_last_read_message_id"
      FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "messages"
      DROP CONSTRAINT "FK_messages_author_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "FK_messages_author_id"
      FOREIGN KEY ("author_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "media"
      DROP CONSTRAINT "FK_media_uploaded_by_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "media"
      ADD CONSTRAINT "FK_media_uploaded_by_id"
      FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      ADD CONSTRAINT "CHK_push_subscriptions_payload"
      CHECK (
        (
          "platform" = 'web'
          AND "endpoint" IS NOT NULL
          AND "p256dh" IS NOT NULL
          AND "auth" IS NOT NULL
          AND "device_token" IS NULL
          AND "environment" IS NULL
          AND "bundle_id" IS NULL
        )
        OR
        (
          "platform" = 'ios'
          AND "endpoint" IS NULL
          AND "p256dh" IS NULL
          AND "auth" IS NULL
          AND "device_token" IS NOT NULL
          AND "environment" IS NOT NULL
          AND "bundle_id" IS NOT NULL
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "push_subscriptions"
      DROP CONSTRAINT "CHK_push_subscriptions_payload"
    `);
    await queryRunner.query(`
      ALTER TABLE "media"
      DROP CONSTRAINT "FK_media_uploaded_by_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "media"
      ADD CONSTRAINT "FK_media_uploaded_by_id"
      FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "messages"
      DROP CONSTRAINT "FK_messages_author_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "FK_messages_author_id"
      FOREIGN KEY ("author_id") REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_participants"
      DROP CONSTRAINT "FK_chat_participants_last_read_message_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      DROP CONSTRAINT "CHK_telegram_links_state_owner"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      DROP CONSTRAINT "FK_telegram_links_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      DROP COLUMN "state"
    `);
    await queryRunner.query(`
      ALTER TABLE "telegram_links"
      DROP COLUMN "user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "chats"
      DROP CONSTRAINT "FK_chats_last_message_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "chats"
      ADD COLUMN "last_message_preview" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "chats"
      DROP COLUMN "last_message_id"
    `);
  }
}
