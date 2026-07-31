import { MigrationInterface, QueryRunner } from "typeorm";

export class SecuritySessionsContactsAndAudit20260731090000 implements MigrationInterface {
  name = "SecuritySessionsContactsAndAudit20260731090000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admins"
      WHERE "id" = '00000000-0000-0000-0000-000000000001'
    `);

    await queryRunner.query(`
      ALTER TABLE "admins"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "mfa_method" character varying NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS "mfa_enrolled_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "admins"
        ADD CONSTRAINT "CHK_admins_failed_login_attempts"
          CHECK ("failed_login_attempts" >= 0),
        ADD CONSTRAINT "CHK_admins_session_version"
          CHECK ("session_version" > 0),
        ADD CONSTRAINT "CHK_admins_mfa_method"
          CHECK ("mfa_method" IN ('none', 'totp'))
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_status"
          CHECK ("status" IN ('active', 'blocked', 'deactivated')),
        ADD CONSTRAINT "CHK_users_session_version"
          CHECK ("session_version" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "phone_verification_codes"
        ADD COLUMN IF NOT EXISTS "request_ip_hash" character varying(64),
        ADD COLUMN IF NOT EXISTS "device_identifier_hash" character varying(64)
    `);
    await queryRunner.query(`
      UPDATE "phone_verification_codes"
      SET "request_ip_hash" = NULL
      WHERE "request_ip_hash" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "phone_verification_codes"
        DROP COLUMN IF EXISTS "request_ip",
        DROP COLUMN IF EXISTS "user_agent"
    `);

    await queryRunner.query(`
      CREATE TABLE "security_audit_events" (
        "id" uuid NOT NULL,
        "event_type" character varying(100) NOT NULL,
        "actor_type" character varying NOT NULL,
        "actor_id" character varying,
        "outcome" character varying NOT NULL,
        "request_id" character varying,
        "ip_hash" character varying(64),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_audit_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_security_audit_actor_type"
          CHECK ("actor_type" IN ('anonymous', 'user', 'admin', 'system')),
        CONSTRAINT "CHK_security_audit_outcome"
          CHECK ("outcome" IN ('success', 'failure', 'denied'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_security_audit_events_type_created"
      ON "security_audit_events" ("event_type", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_security_audit_events_actor_created"
      ON "security_audit_events" ("actor_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL,
        "principal_type" character varying NOT NULL,
        "principal_id" uuid NOT NULL,
        "token_family_id" uuid NOT NULL,
        "device_uuid" character varying(128) NOT NULL,
        "device_name" character varying(128) NOT NULL,
        "platform" character varying NOT NULL DEFAULT 'unknown',
        "ip_hash" character varying(64),
        "user_agent_hash" character varying(64),
        "last_seen_at" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "revoke_reason" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_sessions_family" UNIQUE ("token_family_id"),
        CONSTRAINT "CHK_auth_sessions_principal_type"
          CHECK ("principal_type" IN ('user', 'admin')),
        CONSTRAINT "CHK_auth_sessions_platform"
          CHECK ("platform" IN ('web', 'ios', 'cli', 'unknown')),
        CONSTRAINT "CHK_auth_sessions_expiry"
          CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_principal_active"
      ON "auth_sessions" ("principal_type", "principal_id", "revoked_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_family"
      ON "auth_sessions" ("token_family_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "token_family_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "parent_token_id" uuid,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "replaced_by_token_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_session_id"
          FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_session_created"
      ON "refresh_tokens" ("session_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_family"
      ON "refresh_tokens" ("token_family_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "contact_requests" (
        "id" uuid NOT NULL,
        "pair_key" character varying(73) NOT NULL,
        "requester_user_id" uuid NOT NULL,
        "recipient_user_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "blocked_by_user_id" uuid,
        "responded_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_contact_requests_pair" UNIQUE ("pair_key"),
        CONSTRAINT "FK_contact_requests_requester"
          FOREIGN KEY ("requester_user_id") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_contact_requests_recipient"
          FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_contact_requests_blocked_by"
          FOREIGN KEY ("blocked_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_contact_requests_distinct_users"
          CHECK ("requester_user_id" <> "recipient_user_id"),
        CONSTRAINT "CHK_contact_requests_status"
          CHECK ("status" IN ('pending', 'accepted', 'blocked', 'rejected')),
        CONSTRAINT "CHK_contact_requests_block_owner"
          CHECK (
            ("status" = 'blocked' AND "blocked_by_user_id" IS NOT NULL)
            OR ("status" <> 'blocked' AND "blocked_by_user_id" IS NULL)
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_contact_requests_recipient_status"
      ON "contact_requests" ("recipient_user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_contact_requests_requester_status"
      ON "contact_requests" ("requester_user_id", "status")
    `);

    await queryRunner.query(`
      INSERT INTO "contact_requests" (
        "id",
        "pair_key",
        "requester_user_id",
        "recipient_user_id",
        "status",
        "responded_at",
        "created_at",
        "updated_at"
      )
      SELECT
        "id",
        LEAST("owner_user_id"::text, "contact_user_id"::text)
          || ':' ||
        GREATEST("owner_user_id"::text, "contact_user_id"::text),
        "owner_user_id",
        "contact_user_id",
        'accepted',
        "created_at",
        "created_at",
        "created_at"
      FROM "contacts"
      ON CONFLICT ("pair_key") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE "location_permissions" (
        "id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "grantee_user_id" uuid NOT NULL,
        "contact_request_id" uuid NOT NULL,
        "status" character varying NOT NULL,
        "granted_at" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_location_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_location_permissions_owner_grantee"
          UNIQUE ("owner_user_id", "grantee_user_id"),
        CONSTRAINT "FK_location_permissions_owner"
          FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_location_permissions_grantee"
          FOREIGN KEY ("grantee_user_id") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_location_permissions_contact"
          FOREIGN KEY ("contact_request_id") REFERENCES "contact_requests"("id")
          ON DELETE CASCADE,
        CONSTRAINT "CHK_location_permissions_distinct_users"
          CHECK ("owner_user_id" <> "grantee_user_id"),
        CONSTRAINT "CHK_location_permissions_status"
          CHECK ("status" IN ('active', 'revoked')),
        CONSTRAINT "CHK_location_permissions_revocation"
          CHECK (
            ("status" = 'active' AND "revoked_at" IS NULL)
            OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
          ),
        CONSTRAINT "CHK_location_permissions_expiry"
          CHECK ("expires_at" IS NULL OR "expires_at" > "granted_at")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_location_permissions_grantee_active"
      ON "location_permissions" ("grantee_user_id", "status", "expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "location_permissions"`);
    await queryRunner.query(`DROP TABLE "contact_requests"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`DROP TABLE "security_audit_events"`);

    await queryRunner.query(`
      ALTER TABLE "phone_verification_codes"
        ADD COLUMN "request_ip" character varying,
        ADD COLUMN "user_agent" character varying,
        DROP COLUMN "device_identifier_hash",
        DROP COLUMN "request_ip_hash"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT "CHK_users_session_version",
        DROP CONSTRAINT "CHK_users_status",
        DROP COLUMN "last_login_at",
        DROP COLUMN "session_version",
        DROP COLUMN "status"
    `);

    await queryRunner.query(`
      ALTER TABLE "admins"
        DROP CONSTRAINT "CHK_admins_mfa_method",
        DROP CONSTRAINT "CHK_admins_session_version",
        DROP CONSTRAINT "CHK_admins_failed_login_attempts",
        DROP COLUMN "mfa_enrolled_at",
        DROP COLUMN "mfa_method",
        DROP COLUMN "session_version",
        DROP COLUMN "deactivated_at",
        DROP COLUMN "password_changed_at",
        DROP COLUMN "last_login_at",
        DROP COLUMN "locked_until",
        DROP COLUMN "failed_login_attempts",
        DROP COLUMN "is_active"
    `);
  }
}
