CREATE TABLE "aff"."notification_sends" (
  "id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(150) NOT NULL,
  "target" TEXT NOT NULL,
  "target_user_id" UUID,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_sends_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_sends_created_at_idx" ON "aff"."notification_sends"("created_at");
CREATE UNIQUE INDEX "notification_sends_sender_id_idempotency_key_key" ON "aff"."notification_sends"("sender_id", "idempotency_key");
ALTER TABLE "aff"."notification_sends" ADD CONSTRAINT "notification_sends_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "aff"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "aff"."notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_key" VARCHAR(255) NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "href" VARCHAR(300) NOT NULL,
  "send_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(3),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notifications_user_id_event_key_key" ON "aff"."notifications"("user_id", "event_key");
CREATE INDEX "notifications_user_id_created_at_idx" ON "aff"."notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "aff"."notifications"("user_id", "read_at", "created_at");
ALTER TABLE "aff"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aff"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aff"."notifications" ADD CONSTRAINT "notifications_send_id_fkey" FOREIGN KEY ("send_id") REFERENCES "aff"."notification_sends"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
