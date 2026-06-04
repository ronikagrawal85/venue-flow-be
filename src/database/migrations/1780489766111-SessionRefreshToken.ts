import { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionRefreshToken1780489766111 implements MigrationInterface {
  name = 'SessionRefreshToken1780489766111';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── sessions ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP     NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMP,
        "user_id"     uuid          NOT NULL,
        "user_agent"  TEXT,
        "ip_address"  CHARACTER VARYING,
        "is_active"   BOOLEAN       NOT NULL DEFAULT true,
        "expires_at"  TIMESTAMPTZ   NOT NULL,
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessions_user"
          FOREIGN KEY ("user_id")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_user_id" ON "sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_user_id_is_active" ON "sessions" ("user_id", "is_active")`,
    );

    // ── refresh_tokens ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP     NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMP,
        "session_id"  uuid          NOT NULL,
        "token_hash"  TEXT          NOT NULL,
        "is_used"     BOOLEAN       NOT NULL DEFAULT false,
        "expires_at"  TIMESTAMPTZ   NOT NULL,
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_session"
          FOREIGN KEY ("session_id")
          REFERENCES "sessions" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_session_id" ON "refresh_tokens" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_session_id_is_used" ON "refresh_tokens" ("session_id", "is_used")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_refresh_tokens_session_id_is_used"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_session_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);

    await queryRunner.query(`DROP INDEX "IDX_sessions_user_id_is_active"`);
    await queryRunner.query(`DROP INDEX "IDX_sessions_user_id"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
