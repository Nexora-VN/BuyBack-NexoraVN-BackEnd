-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "aff";

-- CreateEnum
CREATE TYPE "aff"."user_role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "aff"."user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "aff"."users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(120),
    "role" "aff"."user_role" NOT NULL DEFAULT 'USER',
    "status" "aff"."user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "aff"."users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "aff"."users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "aff"."users"("created_at");
