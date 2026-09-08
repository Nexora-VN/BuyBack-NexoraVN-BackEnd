CREATE TYPE "aff"."activity_renderer_mode" AS ENUM ('AUTO', 'RUFFLE', 'HTML', 'DISABLED');
CREATE TYPE "aff"."flash_runtime_status" AS ENUM ('UNTESTED', 'LOADED', 'PARTIAL', 'FAILED');

ALTER TABLE "aff"."activity_definitions"
  ADD COLUMN "renderer_mode" "aff"."activity_renderer_mode" NOT NULL DEFAULT 'HTML';

CREATE TABLE "aff"."flash_runtime_profiles" (
  "source_hash" VARCHAR(64) NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL,
  "swf_version" INTEGER NOT NULL,
  "status" "aff"."flash_runtime_status" NOT NULL DEFAULT 'UNTESTED',
  "ruffle_version" VARCHAR(32) NOT NULL DEFAULT '0.6.0',
  "error" TEXT,
  "tested_at" TIMESTAMPTZ(3),
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "flash_runtime_profiles_pkey" PRIMARY KEY ("source_hash")
);

CREATE TABLE "aff"."flash_runtime_sessions" (
  "id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "nonce" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "opened_at" TIMESTAMPTZ(3),
  "loaded_at" TIMESTAMPTZ(3),
  "last_heartbeat_at" TIMESTAMPTZ(3),
  "active_seconds" INTEGER NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flash_runtime_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flash_runtime_sessions_nonce_key" ON "aff"."flash_runtime_sessions"("nonce");
CREATE INDEX "flash_runtime_sessions_user_id_activity_id_created_at_idx" ON "aff"."flash_runtime_sessions"("user_id", "activity_id", "created_at");
ALTER TABLE "aff"."flash_runtime_sessions" ADD CONSTRAINT "flash_runtime_sessions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "aff"."activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."flash_runtime_sessions" ADD CONSTRAINT "flash_runtime_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
