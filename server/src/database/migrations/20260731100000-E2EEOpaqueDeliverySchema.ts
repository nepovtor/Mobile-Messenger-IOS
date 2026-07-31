import { MigrationInterface, QueryRunner } from "typeorm";

export class E2EEOpaqueDeliverySchema20260731100000 implements MigrationInterface {
  name = "E2EEOpaqueDeliverySchema20260731100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chats"
        ADD COLUMN IF NOT EXISTS "encryption_epoch" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "e2ee_required" boolean NOT NULL DEFAULT false,
        ADD CONSTRAINT "CHK_chats_encryption_epoch"
          CHECK ("encryption_epoch" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "messages"
        ADD COLUMN IF NOT EXISTS "is_legacy" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "migrated_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_messages_legacy_idempotency"
      ON "messages" ("chat_id", "author_id", "client_message_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_devices" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "device_uuid" character varying(128) NOT NULL,
        "device_name" character varying(128) NOT NULL,
        "platform" character varying NOT NULL,
        "identity_public_key" bytea NOT NULL,
        "signed_pre_key" bytea NOT NULL,
        "signed_pre_key_id" integer NOT NULL,
        "signed_pre_key_signature" bytea NOT NULL,
        "registration_id" integer NOT NULL,
        "key_version" integer NOT NULL DEFAULT 1,
        "identity_changed_at" TIMESTAMPTZ,
        "last_seen_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_devices_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_devices_user_uuid" UNIQUE ("user_id", "device_uuid"),
        CONSTRAINT "FK_user_devices_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "CHK_user_devices_platform"
          CHECK ("platform" IN ('web', 'ios')),
        CONSTRAINT "CHK_user_devices_key_version"
          CHECK ("key_version" > 0),
        CONSTRAINT "CHK_user_devices_registration_id"
          CHECK ("registration_id" BETWEEN 1 AND 16380),
        CONSTRAINT "CHK_user_devices_signed_pre_key_id"
          CHECK ("signed_pre_key_id" >= 0),
        CONSTRAINT "CHK_user_devices_public_key_sizes"
          CHECK (
            octet_length("identity_public_key") BETWEEN 32 AND 4096
            AND octet_length("signed_pre_key") BETWEEN 32 AND 4096
            AND octet_length("signed_pre_key_signature") BETWEEN 32 AND 4096
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_devices_user_active"
      ON "user_devices" ("user_id", "revoked_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "one_time_prekeys" (
        "id" uuid NOT NULL,
        "device_id" uuid NOT NULL,
        "key_id" integer NOT NULL,
        "public_key" bytea NOT NULL,
        "claimed_at" TIMESTAMPTZ,
        "claimed_by_device_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_one_time_prekeys_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_one_time_prekeys_device_key"
          UNIQUE ("device_id", "key_id"),
        CONSTRAINT "FK_one_time_prekeys_device_id"
          FOREIGN KEY ("device_id") REFERENCES "user_devices"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_one_time_prekeys_claimed_by_device_id"
          FOREIGN KEY ("claimed_by_device_id") REFERENCES "user_devices"("id")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_one_time_prekeys_key_id"
          CHECK ("key_id" >= 0),
        CONSTRAINT "CHK_one_time_prekeys_public_key_size"
          CHECK (octet_length("public_key") BETWEEN 32 AND 4096),
        CONSTRAINT "CHK_one_time_prekeys_claim_state"
          CHECK (
            ("claimed_at" IS NULL AND "claimed_by_device_id" IS NULL)
            OR ("claimed_at" IS NOT NULL AND "claimed_by_device_id" IS NOT NULL)
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_one_time_prekeys_available"
      ON "one_time_prekeys" ("device_id", "claimed_at", "key_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "encrypted_messages" (
        "id" uuid NOT NULL,
        "chat_id" uuid NOT NULL,
        "sender_user_id" uuid NOT NULL,
        "sender_device_id" uuid NOT NULL,
        "protocol_version" character varying(32) NOT NULL,
        "message_type" character varying NOT NULL,
        "target_message_id" uuid,
        "client_timestamp" TIMESTAMPTZ NOT NULL,
        "server_received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "idempotency_key" uuid NOT NULL,
        "membership_epoch" integer NOT NULL DEFAULT 1,
        "ciphertext_size" integer NOT NULL,
        CONSTRAINT "PK_encrypted_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_encrypted_messages_idempotency"
          UNIQUE ("chat_id", "sender_device_id", "idempotency_key"),
        CONSTRAINT "FK_encrypted_messages_chat_id"
          FOREIGN KEY ("chat_id") REFERENCES "chats"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_encrypted_messages_sender_user_id"
          FOREIGN KEY ("sender_user_id") REFERENCES "users"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_encrypted_messages_sender_device_id"
          FOREIGN KEY ("sender_device_id") REFERENCES "user_devices"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_encrypted_messages_target_message_id"
          FOREIGN KEY ("target_message_id") REFERENCES "encrypted_messages"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "CHK_encrypted_messages_type"
          CHECK ("message_type" IN (
            'text', 'edit', 'delete', 'reaction', 'attachment', 'location', 'system'
          )),
        CONSTRAINT "CHK_encrypted_messages_epoch"
          CHECK ("membership_epoch" > 0),
        CONSTRAINT "CHK_encrypted_messages_ciphertext_size"
          CHECK ("ciphertext_size" > 0 AND "ciphertext_size" <= 1048576)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_encrypted_messages_chat_received"
      ON "encrypted_messages" ("chat_id", "server_received_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "encrypted_message_envelopes" (
        "id" uuid NOT NULL,
        "message_id" uuid NOT NULL,
        "recipient_user_id" uuid NOT NULL,
        "recipient_device_id" uuid NOT NULL,
        "envelope_type" character varying(32) NOT NULL,
        "ciphertext" bytea NOT NULL,
        "encrypted_header" bytea NOT NULL,
        "delivered_at" TIMESTAMPTZ,
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_encrypted_message_envelopes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_encrypted_envelopes_message_device"
          UNIQUE ("message_id", "recipient_device_id"),
        CONSTRAINT "FK_encrypted_envelopes_message_id"
          FOREIGN KEY ("message_id") REFERENCES "encrypted_messages"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_encrypted_envelopes_recipient_user_id"
          FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_encrypted_envelopes_recipient_device_id"
          FOREIGN KEY ("recipient_device_id") REFERENCES "user_devices"("id")
          ON DELETE CASCADE,
        CONSTRAINT "CHK_encrypted_envelopes_ciphertext_size"
          CHECK (
            octet_length("ciphertext") BETWEEN 1 AND 1048576
            AND octet_length("encrypted_header") BETWEEN 1 AND 65536
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_encrypted_envelopes_recipient_delivery"
      ON "encrypted_message_envelopes"
        ("recipient_device_id", "delivered_at", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "encrypted_attachments" (
        "id" uuid NOT NULL,
        "object_key" character varying NOT NULL,
        "uploaded_by_id" uuid NOT NULL,
        "size_bytes" integer NOT NULL,
        "ciphertext_hash" character varying(64) NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "uploaded_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_encrypted_attachments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_encrypted_attachments_object_key" UNIQUE ("object_key"),
        CONSTRAINT "FK_encrypted_attachments_uploaded_by_id"
          FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "CHK_encrypted_attachments_size"
          CHECK ("size_bytes" > 0 AND "size_bytes" <= 104857600),
        CONSTRAINT "CHK_encrypted_attachments_hash"
          CHECK ("ciphertext_hash" ~ '^[a-f0-9]{64}$'),
        CONSTRAINT "CHK_encrypted_attachments_status"
          CHECK ("status" IN ('pending', 'uploaded', 'expired')),
        CONSTRAINT "CHK_encrypted_attachments_expiry"
          CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_encrypted_attachments_pending_expiry"
      ON "encrypted_attachments" ("status", "expires_at")
    `);

    for (const table of [
      "admins",
      "users",
      "phone_verification_codes",
      "telegram_links",
      "telegram_pairing_tokens",
      "chats",
      "chat_participants",
      "messages",
      "contacts",
      "location_shares",
      "media",
      "push_subscriptions",
      "security_audit_events",
      "auth_sessions",
      "refresh_tokens",
      "contact_requests",
      "location_permissions",
      "user_devices",
      "one_time_prekeys",
      "encrypted_messages",
      "encrypted_message_envelopes",
      "encrypted_attachments",
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
          REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;
          REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "encrypted_attachments"`);
    await queryRunner.query(`DROP TABLE "encrypted_message_envelopes"`);
    await queryRunner.query(`DROP TABLE "encrypted_messages"`);
    await queryRunner.query(`DROP TABLE "one_time_prekeys"`);
    await queryRunner.query(`DROP TABLE "user_devices"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_messages_legacy_idempotency"`,
    );
    await queryRunner.query(`
      ALTER TABLE "messages"
        DROP COLUMN "migrated_at",
        DROP COLUMN "is_legacy"
    `);
    await queryRunner.query(`
      ALTER TABLE "chats"
        DROP CONSTRAINT "CHK_chats_encryption_epoch",
        DROP COLUMN "e2ee_required",
        DROP COLUMN "encryption_epoch"
    `);
  }
}
