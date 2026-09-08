-- New objects belong to aff, including databases with a different default search_path.
BEGIN;
SET LOCAL search_path TO aff, public;
-- Existing migrations require DATABASE_URL to contain schema=aff.
-- Unique index creation deliberately fails on duplicate tracking tokens; never delete attribution.
-- CreateEnum
CREATE TYPE "CommissionState" AS ENUM ('ESTIMATED', 'VALIDATED', 'PAID', 'REJECTED', 'REVERSED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "CashbackState" AS ENUM ('PENDING', 'VALIDATED', 'AVAILABLE', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WithdrawalState" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchState" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "affiliate_link" ADD COLUMN     "affiliate_id_snapshot" TEXT;

-- AlterTable
ALTER TABLE "product" ALTER COLUMN "price" SET DATA TYPE BIGINT USING FLOOR("price")::BIGINT,
ALTER COLUMN "commission" SET DATA TYPE BIGINT USING FLOOR("commission")::BIGINT,
ALTER COLUMN "seller_com_final" SET DATA TYPE BIGINT USING FLOOR("seller_com_final")::BIGINT,
ALTER COLUMN "shopee_com_final" SET DATA TYPE BIGINT USING FLOOR("shopee_com_final")::BIGINT,
ALTER COLUMN "seller_rate" SET DATA TYPE INTEGER USING ROUND(("seller_rate" * 10000)::numeric)::INTEGER,
ALTER COLUMN "shopee_rate" SET DATA TYPE INTEGER USING ROUND(("shopee_rate" * 10000)::numeric)::INTEGER,
ALTER COLUMN "seller_rate_percent" SET DATA TYPE INTEGER USING ROUND(("seller_rate_percent" * 100)::numeric)::INTEGER,
ALTER COLUMN "shopee_rate_percent" SET DATA TYPE INTEGER USING ROUND(("shopee_rate_percent" * 100)::numeric)::INTEGER,
ALTER COLUMN "total_rate_percent" SET DATA TYPE INTEGER USING ROUND(("total_rate_percent" * 100)::numeric)::INTEGER;

-- AlterTable
ALTER TABLE "user_bank" ADD COLUMN     "account_ciphertext" TEXT,
ADD COLUMN     "account_holder" TEXT,
ADD COLUMN     "account_iv" TEXT,
ADD COLUMN     "account_tag" TEXT,
ADD COLUMN     "last_four" VARCHAR(4),
ADD COLUMN     "previous_id" UUID,
ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" TEXT NOT NULL DEFAULT 'SAFFI',
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "last_validated_at" TIMESTAMP(3),
    "rotated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_leases" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_batches" (
    "id" UUID NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "BatchState" NOT NULL DEFAULT 'QUEUED',
    "pages" INTEGER NOT NULL DEFAULT 0,
    "records" INTEGER NOT NULL DEFAULT 0,
    "failed_records" INTEGER NOT NULL DEFAULT 0,
    "credential_version" INTEGER,
    "error_code" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reconciliation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_pages" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "page" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "reconciliation_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_checkouts" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SAFFI',
    "checkout_id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "utm_content" TEXT NOT NULL,
    "conversion_state" TEXT NOT NULL,
    "raw_status" TEXT NOT NULL,
    "net_raw" BIGINT NOT NULL,
    "scale" INTEGER NOT NULL DEFAULT 100000,
    "payload" JSONB NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_orders" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SAFFI',
    "order_id" TEXT NOT NULL,
    "order_sn" TEXT NOT NULL,
    "affiliate_transaction_id" TEXT,
    "checkout_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "item_price_raw" BIGINT NOT NULL,
    "actual_amount_raw" BIGINT NOT NULL,
    "refunded_amount_raw" BIGINT NOT NULL,
    "commission_raw" BIGINT NOT NULL,
    "brand_commission_raw" BIGINT NOT NULL,
    "brand_rate" INTEGER NOT NULL,
    "platform_rate" INTEGER NOT NULL,
    "scale" INTEGER NOT NULL DEFAULT 100000,
    "payload" JSONB NOT NULL,

    CONSTRAINT "provider_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_issues" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "checkout_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "payload" JSONB NOT NULL,
    "resolution" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "user_id" UUID,
    "affiliate_link_id" UUID,
    "state" "CommissionState" NOT NULL DEFAULT 'ESTIMATED',
    "raw_amount" BIGINT NOT NULL,
    "scale" INTEGER NOT NULL DEFAULT 100000,
    "estimated_vnd" BIGINT NOT NULL,
    "settled_vnd" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_policies" (
    "id" INTEGER NOT NULL,
    "user_bps" INTEGER NOT NULL DEFAULT 8500,
    "min_withdrawal" BIGINT NOT NULL DEFAULT 50000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_allocations" (
    "id" UUID NOT NULL,
    "commission_id" UUID NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "user_bps" INTEGER NOT NULL DEFAULT 8500,
    "user_amount" BIGINT NOT NULL DEFAULT 0,
    "platform_amount" BIGINT NOT NULL DEFAULT 0,
    "state" "CashbackState" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_batches" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "gross_vnd" BIGINT NOT NULL,
    "deduction_vnd" BIGINT NOT NULL,
    "net_vnd" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "commission_id" UUID NOT NULL,
    "raw_snapshot" BIGINT NOT NULL,
    "net_vnd" BIGINT NOT NULL,

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "available" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "available_delta" BIGINT NOT NULL,
    "reserved_delta" BIGINT NOT NULL,
    "available_after" BIGINT NOT NULL,
    "reserved_after" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "WithdrawalState" NOT NULL DEFAULT 'PENDING',
    "bank_snapshot" JSONB NOT NULL,
    "transfer_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_status_history" (
    "id" UUID NOT NULL,
    "withdrawal_id" UUID NOT NULL,
    "status" "WithdrawalState" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_batches_status_created_at_idx" ON "reconciliation_batches"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_pages_batch_id_page_key" ON "reconciliation_pages"("batch_id", "page");

-- CreateIndex
CREATE INDEX "provider_checkouts_purchased_at_idx" ON "provider_checkouts"("purchased_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_checkouts_provider_checkout_id_key" ON "provider_checkouts"("provider", "checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_orders_affiliate_transaction_id_key" ON "provider_orders"("affiliate_transaction_id");

-- CreateIndex
CREATE INDEX "provider_orders_checkout_id_idx" ON "provider_orders"("checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_orders_provider_order_id_key" ON "provider_orders"("provider", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_order_items_order_id_item_id_model_id_promotion_id_key" ON "provider_order_items"("order_id", "item_id", "model_id", "promotion_id");

-- CreateIndex
CREATE INDEX "reconciliation_issues_status_created_at_idx" ON "reconciliation_issues"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_checkout_id_key" ON "commissions"("checkout_id");

-- CreateIndex
CREATE INDEX "commissions_user_id_state_idx" ON "commissions"("user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_allocations_commission_id_key" ON "cashback_allocations"("commission_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_batches_reference_key" ON "settlement_batches"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_commission_id_key" ON "settlement_items"("commission_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_settlement_id_commission_id_key" ON "settlement_items"("settlement_id", "commission_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_idempotency_key_key" ON "withdrawals"("idempotency_key");

-- CreateIndex
CREATE INDEX "withdrawals_user_id_status_idx" ON "withdrawals"("user_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_link_sub_id_2_key" ON "affiliate_link"("sub_id_2");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_link_sub_id_4_key" ON "affiliate_link"("sub_id_4");

-- AddForeignKey
ALTER TABLE "reconciliation_pages" ADD CONSTRAINT "reconciliation_pages_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "reconciliation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "provider_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_order_items" ADD CONSTRAINT "provider_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "provider_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_issues" ADD CONSTRAINT "reconciliation_issues_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "reconciliation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "provider_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_allocations" ADD CONSTRAINT "cashback_allocations_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_allocations" ADD CONSTRAINT "cashback_allocations_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "affiliate_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlement_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "user_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_status_history" ADD CONSTRAINT "withdrawal_status_history_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing bank records have no payment details and must be resubmitted.
UPDATE "aff"."user_bank" SET status = 'PENDING' WHERE account_ciphertext IS NULL;
INSERT INTO "aff"."affiliate_policies" ("id","user_bps","min_withdrawal") VALUES (1,8500,50000);
COMMIT;
