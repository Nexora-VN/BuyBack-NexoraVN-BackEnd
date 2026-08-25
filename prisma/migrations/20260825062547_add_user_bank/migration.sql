/*
  Warnings:

  - Added the required column `createdBy` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deleteBy` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `delete_at` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone_number` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedBy` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "user_bank_status" AS ENUM ('PENDING', 'APPROVED', 'REJECT');

-- AlterEnum
ALTER TYPE "user_status" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "createdBy" UUID NOT NULL,
ADD COLUMN     "deleteBy" UUID NOT NULL,
ADD COLUMN     "delete_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "full_name" VARCHAR(50),
ADD COLUMN     "phone_number" VARCHAR(20) NOT NULL,
ADD COLUMN     "updatedBy" UUID NOT NULL;

-- CreateTable
CREATE TABLE "user_bank" (
    "id" UUID NOT NULL,
    "bank_code" VARCHAR(20) NOT NULL,
    "bank_name" VARCHAR(100),
    "bank_branch" VARCHAR(100),
    "status" "user_bank_status" NOT NULL DEFAULT 'PENDING',
    "delete_at" TIMESTAMPTZ(3) NOT NULL,
    "deleteBy" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "user_bank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_bank_status_idx" ON "user_bank"("status");

-- CreateIndex
CREATE INDEX "user_bank_created_at_idx" ON "user_bank"("created_at");

-- AddForeignKey
ALTER TABLE "user_bank" ADD CONSTRAINT "user_bank_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
