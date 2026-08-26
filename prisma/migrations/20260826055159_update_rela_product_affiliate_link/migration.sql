/*
  Warnings:

  - Added the required column `product_id` to the `affiliate_link` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "affiliate_link" ADD COLUMN     "product_id" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "affiliate_link" ADD CONSTRAINT "affiliate_link_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
