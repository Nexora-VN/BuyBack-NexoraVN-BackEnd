BEGIN;
ALTER TABLE "aff"."provider_credentials"
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "expected_affiliate" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "verification_evidence" TEXT;
ALTER TABLE "aff"."reconciliation_batches"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'SAFFI',
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "expected_affiliate" TEXT,
  ADD COLUMN "summary" JSONB;
ALTER TABLE "aff"."provider_checkouts"
  ADD COLUMN "account_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "source_hash" TEXT;
ALTER TABLE "aff"."reconciliation_issues"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'SAFFI',
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "source_hash" TEXT;
ALTER TABLE "aff"."settlement_items" ADD COLUMN "revision_snapshot" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "aff"."conversion_item_snapshots" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "page" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "checkout_id" TEXT NOT NULL,
  "order_sn" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "conversion_item_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversion_item_snapshots_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "aff"."reconciliation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversion_item_snapshots_batch_id_page_position_key" ON "aff"."conversion_item_snapshots"("batch_id", "page", "position");
CREATE INDEX "conversion_item_snapshots_batch_id_checkout_id_idx" ON "aff"."conversion_item_snapshots"("batch_id", "checkout_id");
-- Keep history; do not run queued Saffi batches under another provider.
UPDATE "aff"."reconciliation_batches" SET "status" = 'FAILED', "error_code" = 'PROVIDER_RETIRED', "completed_at" = CURRENT_TIMESTAMP
WHERE "provider" = 'SAFFI' AND "status" IN ('QUEUED', 'RUNNING');
COMMIT;
