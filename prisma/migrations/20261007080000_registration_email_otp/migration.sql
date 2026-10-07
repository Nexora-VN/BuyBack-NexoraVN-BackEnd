ALTER TABLE "aff"."users" ALTER COLUMN "phone_number" DROP NOT NULL;

CREATE TABLE "aff"."registration_challenges" (
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resend_after" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "registration_challenges_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "registration_challenges_expires_at_idx"
ON "aff"."registration_challenges"("expires_at");
