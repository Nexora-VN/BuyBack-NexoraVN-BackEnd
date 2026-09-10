-- ==============================================================================
-- Purge All Saffi Reconciliation Data (Reset to clean state for AddLiveTag)
-- Option A: Cleans all Saffi records & test wallet allocations/balances.
-- ==============================================================================

BEGIN;

-- 1. Xóa các issues đối soát (bảng reconciliation_issues có khóa ngoại tới batch)
DELETE FROM aff.reconciliation_issues;

-- 2. Xóa các settlement items liên kết với commission của Saffi
DELETE FROM aff.settlement_items
WHERE commission_id IN (
  SELECT c.id 
  FROM aff.commissions c
  JOIN aff.provider_checkouts pc ON c.checkout_id = pc.id
  WHERE pc.provider = 'SAFFI' OR pc.provider LIKE 'SAFFI:%'
);

-- 3. Xóa các settlement batch rỗng sau khi xóa item
DELETE FROM aff.settlement_batches sb
WHERE NOT EXISTS (SELECT 1 FROM aff.settlement_items si WHERE si.settlement_id = sb.id);

-- 4. Xóa các giao dịch ví liên quan đến cashback Saffi & reset ví test
DELETE FROM aff.wallet_transactions
WHERE reference IN (
  SELECT c.id::text 
  FROM aff.commissions c
  JOIN aff.provider_checkouts pc ON c.checkout_id = pc.id
  WHERE pc.provider = 'SAFFI' OR pc.provider LIKE 'SAFFI:%'
) 
OR reference LIKE 'reversal:%'
OR type IN ('CASHBACK_CREDIT', 'CASHBACK_REVERSAL');

-- Reset số dư ví test về 0
UPDATE aff.wallets SET available = 0, reserved = 0, updated_at = NOW();

-- 5. Xóa cashback allocations của Saffi
DELETE FROM aff.cashback_allocations
WHERE commission_id IN (
  SELECT c.id 
  FROM aff.commissions c
  JOIN aff.provider_checkouts pc ON c.checkout_id = pc.id
  WHERE pc.provider = 'SAFFI' OR pc.provider LIKE 'SAFFI:%'
);

-- 6. Xóa commissions của Saffi
DELETE FROM aff.commissions
WHERE checkout_id IN (
  SELECT id 
  FROM aff.provider_checkouts 
  WHERE provider = 'SAFFI' OR provider LIKE 'SAFFI:%'
);

-- 7. Xóa provider order items của Saffi
DELETE FROM aff.provider_order_items
WHERE order_id IN (
  SELECT id 
  FROM aff.provider_orders 
  WHERE provider = 'SAFFI' OR provider LIKE 'SAFFI:%'
);

-- 8. Xóa provider orders của Saffi
DELETE FROM aff.provider_orders 
WHERE provider = 'SAFFI' OR provider LIKE 'SAFFI:%';

-- 9. Xóa provider checkouts của Saffi
DELETE FROM aff.provider_checkouts 
WHERE provider = 'SAFFI' OR provider LIKE 'SAFFI:%';

-- 10. Xóa conversion_item_snapshots (nếu bảng đã được tạo)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'aff' AND table_name = 'conversion_item_snapshots') THEN
    DELETE FROM aff.conversion_item_snapshots;
  END IF;
END $$;

-- 11. Xóa reconciliation_pages (bắt buộc trước khi xóa reconciliation_batches do khóa ngoại)
DELETE FROM aff.reconciliation_pages;

-- 12. Xóa reconciliation batches của Saffi
DELETE FROM aff.reconciliation_batches;

-- 13. Xóa credential của Saffi (tên bảng chính xác trong PostgreSQL là provider_credentials)
DELETE FROM aff.provider_credentials 
WHERE id = 'SAFFI';

COMMIT;
