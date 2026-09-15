-- Require an explicit provider for all reconciliation writes.
ALTER TABLE "aff"."provider_credentials" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "aff"."reconciliation_batches" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "aff"."provider_checkouts" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "aff"."provider_orders" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "aff"."reconciliation_issues" ALTER COLUMN "provider" DROP DEFAULT;
