import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketFieldsToBookings1749456001000 implements MigrationInterface {
  name = 'AddTicketFieldsToBookings1749456001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Postgres sequence for generating sequential ticket numbers
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "ticket_number_seq" START 1 INCREMENT 1`,
    );

    // 2. Enum type for ticket status
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_ticket_status_enum" AS ENUM('ACTIVE', 'USED', 'CANCELLED')`,
    );

    // 3. New columns on bookings table
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "ticket_number" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "UQ_bookings_ticket_number" UNIQUE ("ticket_number")`,
    );

    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "qr_payload" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "UQ_bookings_qr_payload" UNIQUE ("qr_payload")`,
    );

    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "ticket_status" "public"."bookings_ticket_status_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "issued_at" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "checked_in_at" TIMESTAMP WITH TIME ZONE`,
    );

    // 4. Unique indexes for fast lookup
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bookings_ticket_number" ON "bookings" ("ticket_number") WHERE ticket_number IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bookings_qr_payload" ON "bookings" ("qr_payload") WHERE qr_payload IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_qr_payload"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_ticket_number"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "checked_in_at"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "issued_at"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "ticket_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "UQ_bookings_qr_payload"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "qr_payload"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "UQ_bookings_ticket_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "ticket_number"`,
    );
    await queryRunner.query(`DROP TYPE "public"."bookings_ticket_status_enum"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "ticket_number_seq"`);
  }
}
