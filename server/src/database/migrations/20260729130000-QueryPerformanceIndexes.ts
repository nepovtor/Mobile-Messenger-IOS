import { MigrationInterface, QueryRunner } from "typeorm";

export class QueryPerformanceIndexes20260729130000 implements MigrationInterface {
  name = "QueryPerformanceIndexes20260729130000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_messages_chat_created_id"
      ON "messages" ("chat_id", "created_at" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_participants_user_chat"
      ON "chat_participants" ("user_id", "chat_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chats_last_activity"
      ON "chats" ("last_activity" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chats_last_activity"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_chat_participants_user_chat"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_messages_chat_created_id"`,
    );
  }
}
