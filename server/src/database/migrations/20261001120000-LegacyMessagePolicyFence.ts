import { MigrationInterface, QueryRunner } from "typeorm";

export class LegacyMessagePolicyFence20261001120000 implements MigrationInterface {
  public readonly name = "LegacyMessagePolicyFence20261001120000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION enforce_legacy_message_policy() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE requires_e2ee boolean;
      DECLARE target_chat_id uuid;
      BEGIN
        IF TG_OP = 'UPDATE' AND NEW.chat_id <> OLD.chat_id THEN
          RAISE EXCEPTION 'Legacy messages cannot move between chats'
            USING ERRCODE = '23514';
        END IF;

        IF TG_OP = 'DELETE' THEN
          target_chat_id := OLD.chat_id;
        ELSE
          target_chat_id := NEW.chat_id;
        END IF;

        -- Every writer and every policy update serializes on the same chat row.
        -- READ COMMITTED observes the committed policy after waiting for a lock.
        SELECT e2ee_required INTO requires_e2ee
        FROM chats WHERE id = target_chat_id
        FOR UPDATE;

        IF requires_e2ee IS NULL THEN
          RAISE EXCEPTION 'Chat is unavailable for legacy message mutation'
            USING ERRCODE = '23503';
        END IF;
        IF requires_e2ee THEN
          RAISE EXCEPTION 'Plaintext messages are disabled for this chat'
            USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION enforce_legacy_message_policy() FROM PUBLIC`,
    );
    await queryRunner.query(`
      CREATE TRIGGER legacy_message_policy_fence
      BEFORE INSERT OR UPDATE OR DELETE ON messages
      FOR EACH ROW EXECUTE FUNCTION enforce_legacy_message_policy()
    `);
    await queryRunner.query(`
      CREATE FUNCTION prevent_chat_e2ee_downgrade() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.e2ee_required AND NOT NEW.e2ee_required THEN
          RAISE EXCEPTION 'E2EE policy cannot be downgraded'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION prevent_chat_e2ee_downgrade() FROM PUBLIC`,
    );
    await queryRunner.query(`
      CREATE TRIGGER chat_e2ee_no_downgrade
      BEFORE UPDATE OF e2ee_required ON chats
      FOR EACH ROW EXECUTE FUNCTION prevent_chat_e2ee_downgrade()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER chat_e2ee_no_downgrade ON chats`);
    await queryRunner.query(`DROP FUNCTION prevent_chat_e2ee_downgrade()`);
    await queryRunner.query(
      `DROP TRIGGER legacy_message_policy_fence ON messages`,
    );
    await queryRunner.query(`DROP FUNCTION enforce_legacy_message_policy()`);
  }
}
