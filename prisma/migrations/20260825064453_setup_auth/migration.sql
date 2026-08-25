/*
  Warnings:

  - You are about to drop the column `createdBy` on the `user_bank` table. All the data in the column will be lost.
  - You are about to drop the column `deleteBy` on the `user_bank` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `user_bank` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `deleteBy` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phone_number]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_bank" DROP COLUMN "createdBy",
DROP COLUMN "deleteBy",
DROP COLUMN "updatedBy",
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "delete_by" UUID,
ADD COLUMN     "updated_by" UUID,
ALTER COLUMN "delete_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "createdBy",
DROP COLUMN "deleteBy",
DROP COLUMN "updatedBy",
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "delete_by" UUID,
ADD COLUMN     "updated_by" UUID,
ALTER COLUMN "delete_at" DROP NOT NULL;

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
