import { MigrationInterface, QueryRunner } from "typeorm";

export class MatrixRoomBindingsAndRevocationOutbox20261006160000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SCHEMA matrix_lifecycle;
      REVOKE ALL ON SCHEMA matrix_lifecycle FROM PUBLIC;
      CREATE TABLE matrix_lifecycle.chat_rooms (
        chat_id uuid PRIMARY KEY REFERENCES public.chats(id),
        room_id varchar(255) UNIQUE NOT NULL,
        bound_by_user_id uuid NOT NULL,
        bound_epoch integer NOT NULL CHECK (bound_epoch >= 1),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE matrix_lifecycle.revocation_outbox (
        principal_id uuid PRIMARY KEY,
        generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
        completed_generation bigint NOT NULL DEFAULT 0 CHECK (completed_generation >= 0 AND completed_generation <= generation),
        requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        quarantine_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '360 seconds'),
        lease_id uuid,
        lease_until timestamptz,
        next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        attempts integer NOT NULL DEFAULT 0,
        mas_lock_marker text
      );
      CREATE INDEX matrix_revocation_pending ON matrix_lifecycle.revocation_outbox(next_attempt_at)
        WHERE generation > completed_generation;
      ALTER TABLE matrix_lifecycle.chat_rooms ENABLE ROW LEVEL SECURITY;
      ALTER TABLE matrix_lifecycle.revocation_outbox ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON ALL TABLES IN SCHEMA matrix_lifecycle FROM PUBLIC;
      CREATE FUNCTION matrix_lifecycle.enqueue_revocation() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
      DECLARE principal uuid;
      BEGIN
        IF TG_TABLE_NAME = 'auth_sessions' THEN
          IF NEW.principal_type <> 'user' OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RETURN NEW; END IF;
          principal := NEW.principal_id;
        ELSIF TG_OP = 'DELETE' THEN
          principal := OLD.id;
        ELSE
          IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.session_version IS NOT DISTINCT FROM OLD.session_version THEN RETURN NEW; END IF;
          principal := NEW.id;
        END IF;
        INSERT INTO matrix_lifecycle.revocation_outbox(principal_id) VALUES (principal)
        ON CONFLICT (principal_id) DO UPDATE SET
          generation = matrix_lifecycle.revocation_outbox.generation + 1,
          requested_at = clock_timestamp(), next_attempt_at = clock_timestamp(),
          quarantine_until = clock_timestamp() + interval '360 seconds';
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$;
      REVOKE ALL ON FUNCTION matrix_lifecycle.enqueue_revocation() FROM PUBLIC;
      CREATE TRIGGER matrix_session_revocation AFTER UPDATE OF revoked_at ON public.auth_sessions
        FOR EACH ROW EXECUTE FUNCTION matrix_lifecycle.enqueue_revocation();
      CREATE TRIGGER matrix_account_revocation AFTER UPDATE OF status, session_version OR DELETE ON public.users
        FOR EACH ROW EXECUTE FUNCTION matrix_lifecycle.enqueue_revocation();
      CREATE FUNCTION matrix_lifecycle.immutable_room() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
      BEGIN
        RAISE EXCEPTION 'Matrix room bindings are immutable' USING ERRCODE = '23514';
      END;
      $$;
      REVOKE ALL ON FUNCTION matrix_lifecycle.immutable_room() FROM PUBLIC;
      CREATE TRIGGER matrix_room_immutable BEFORE UPDATE OR DELETE ON matrix_lifecycle.chat_rooms
        FOR EACH ROW EXECUTE FUNCTION matrix_lifecycle.immutable_room();
    `);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Never remove a room binding or its plaintext fence during rollback.
    const rows: { count: string }[] = await queryRunner.query(
      "SELECT count(*) FROM matrix_lifecycle.chat_rooms",
    );
    if (rows[0]?.count !== "0")
      throw new Error(
        "Cannot roll back a deployed Matrix migration with room bindings",
      );
    const pending: { count: string }[] = await queryRunner.query(
      "SELECT count(*) FROM matrix_lifecycle.revocation_outbox",
    );
    if (pending[0]?.count !== "0")
      throw new Error("Cannot discard Matrix revocation history");
    await queryRunner.query(`
      DROP TRIGGER matrix_session_revocation ON public.auth_sessions;
      DROP TRIGGER matrix_account_revocation ON public.users;
      DROP SCHEMA matrix_lifecycle CASCADE;
    `);
  }
}
