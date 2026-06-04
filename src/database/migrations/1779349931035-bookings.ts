import { MigrationInterface, QueryRunner } from 'typeorm';

export class Bookings1779349931035 implements MigrationInterface {
  name = 'Bookings1779349931035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "booking_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "booking_id" uuid NOT NULL, "event_seat_id" uuid NOT NULL, "price_at_booking" numeric(10,2) NOT NULL, CONSTRAINT "CHK_cf2188708dbb727f7a2feb65b0" CHECK ("price_at_booking" >= 0), CONSTRAINT "PK_53d863efb388346f9bee6ec6701" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bed0bf674c54bf792c6161f7f9" ON "booking_items" ("event_seat_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ef31cb9266b7deb19ad6084747" ON "booking_items" ("booking_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "user_id" uuid NOT NULL, "event_id" uuid NOT NULL, "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'PENDING', "total_amount" numeric(12,2) NOT NULL DEFAULT '0', "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancellation_reason" text, CONSTRAINT "CHK_8271a0299c9ec9640f09b10e7a" CHECK ("total_amount" >= 0), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2917869bb47731126f4b3ce95d" ON "bookings" ("event_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e2ceb5bc81c2ed54f8aa95ffd" ON "bookings" ("user_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_items" ADD CONSTRAINT "FK_ef31cb9266b7deb19ad60847479" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_items" ADD CONSTRAINT "FK_bed0bf674c54bf792c6161f7f9f" FOREIGN KEY ("event_seat_id") REFERENCES "event_seats"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_64cd97487c5c42806458ab5520c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_976c0fe23c870f914acd2378e4e" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_976c0fe23c870f914acd2378e4e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_64cd97487c5c42806458ab5520c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_items" DROP CONSTRAINT "FK_bed0bf674c54bf792c6161f7f9f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_items" DROP CONSTRAINT "FK_ef31cb9266b7deb19ad60847479"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8e2ceb5bc81c2ed54f8aa95ffd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2917869bb47731126f4b3ce95d"`,
    );
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ef31cb9266b7deb19ad6084747"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bed0bf674c54bf792c6161f7f9"`,
    );
    await queryRunner.query(`DROP TABLE "booking_items"`);
  }
}
