CREATE TABLE "aff"."user_device_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token" VARCHAR(512) NOT NULL,
  "device_type" VARCHAR(50) NOT NULL DEFAULT 'web',
  "user_agent" VARCHAR(512),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_device_tokens_token_key" ON "aff"."user_device_tokens"("token");
CREATE INDEX "user_device_tokens_user_id_idx" ON "aff"."user_device_tokens"("user_id");

ALTER TABLE "aff"."user_device_tokens" ADD CONSTRAINT "user_device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
