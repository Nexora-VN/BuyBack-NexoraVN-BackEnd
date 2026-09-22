-- Preserve existing products and affiliate tracking; duplicates require manual review.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "aff"."product"
    GROUP BY "shop_id", "item_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate products for (shop_id, item_id); resolve duplicates before applying this migration. No products were merged or deleted.';
  END IF;
END $$;

CREATE UNIQUE INDEX "product_shop_id_item_id_key" ON "aff"."product"("shop_id", "item_id");
