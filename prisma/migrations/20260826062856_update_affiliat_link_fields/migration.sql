/*
  Warnings:

  - Added the required column `updated_at` to the `affiliate_link` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "affiliate_link_status" AS ENUM ('WORKING', 'DELETED', 'EXPIRED');

-- AlterTable
ALTER TABLE "affiliate_link" ADD COLUMN     "affiliate_link_status" "affiliate_link_status",
ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "delete_at" TIMESTAMPTZ(3),
ADD COLUMN     "delete_by" UUID,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updated_by" UUID;
