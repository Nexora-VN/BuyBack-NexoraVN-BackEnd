/*
  Warnings:

  - You are about to drop the column `convertOrigin` on the `affiliate_link` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "affiliate_link" DROP COLUMN "convertOrigin",
ADD COLUMN     "convert_origin" "convert_origin" NOT NULL DEFAULT 'SYSTEM';
