import { MigrationInterface, QueryRunner } from 'typeorm';

export class Auditlogs1781076252543 implements MigrationInterface {
  name = 'Auditlogs1781076252543';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_ticket_number"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_qr_payload"`);
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'LOGOUT', 'REGISTER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action" "public"."audit_logs_action_enum" NOT NULL, "entity_type" character varying(50) NOT NULL, "entity_id" uuid, "user_id" uuid, "user_email" character varying, "changes" jsonb, "ip_address" character varying, "user_agent" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2cd10fda8276bb995288acfbfb" ON "audit_logs" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON "audit_logs" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7421efc125d95e413657efa3c6" ON "audit_logs" ("entity_type", "entity_id") `,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar_url" text`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "phone" character varying(20)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0169ccd3b5f570660afc7f5e6c" ON "bookings" ("ticket_number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3b110efcf71b96ade2e8b60c38" ON "bookings" ("qr_payload") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b110efcf71b96ade2e8b60c38"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0169ccd3b5f570660afc7f5e6c"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7421efc125d95e413657efa3c6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bd2726fd31b35443f2245b93ba"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2cd10fda8276bb995288acfbfb"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bookings_qr_payload" ON "bookings" ("qr_payload") WHERE (qr_payload IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bookings_ticket_number" ON "bookings" ("ticket_number") WHERE (ticket_number IS NOT NULL)`,
    );
  }
}
