CREATE TABLE "aff"."password_reset_challenges" (
    "email" VARCHAR(320) NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resend_after" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "password_reset_challenges_expires_at_idx" ON "aff"."password_reset_challenges"("expires_at");
CREATE INDEX "password_reset_challenges_user_id_idx" ON "aff"."password_reset_challenges"("user_id");
ALTER TABLE "aff"."password_reset_challenges" ADD CONSTRAINT "password_reset_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
