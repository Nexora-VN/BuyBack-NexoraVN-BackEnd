-- Bring only untouched legacy defaults in line with the published launch policy.
-- Preserve an administrator's explicit custom policy for review in the admin UI.
ALTER TABLE "aff"."affiliate_policies"
  ALTER COLUMN "user_bps" SET DEFAULT 8000,
  ALTER COLUMN "min_withdrawal" SET DEFAULT 10000;

ALTER TABLE "aff"."cashback_allocations"
  ALTER COLUMN "user_bps" SET DEFAULT 8000;

UPDATE "aff"."affiliate_policies"
SET "user_bps" = 8000, "min_withdrawal" = 10000
WHERE "id" = 1 AND "user_bps" = 8500 AND "min_withdrawal" = 50000;
