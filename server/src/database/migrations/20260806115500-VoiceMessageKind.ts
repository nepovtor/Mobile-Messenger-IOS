import { MigrationInterface, QueryRunner } from "typeorm";

export class VoiceMessageKind20260806115500 implements MigrationInterface {
  public readonly name = "VoiceMessageKind20260806115500";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "messages"
      DROP CONSTRAINT IF EXISTS "CHK_messages_kind"
    `);

    await queryRunner.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "CHK_messages_kind"
      CHECK ("kind" IN ('text', 'image', 'audio'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "messages"
      SET "kind" = 'text',
          "text" = COALESCE("text", 'Voice message')
      WHERE "kind" = 'audio'
    `);

    await queryRunner.query(`
      ALTER TABLE "messages"
      DROP CONSTRAINT IF EXISTS "CHK_messages_kind"
    `);

    await queryRunner.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "CHK_messages_kind"
      CHECK ("kind" IN ('text', 'image'))
    `);
  }
}
