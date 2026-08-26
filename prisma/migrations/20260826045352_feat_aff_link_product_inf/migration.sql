-- CreateEnum
CREATE TYPE "convert_origin" AS ENUM ('SYSTEM', 'PARTY');

-- CreateTable
CREATE TABLE "affiliate_link" (
    "id" UUID NOT NULL,
    "sub_id_1" VARCHAR(50),
    "sub_id_2" VARCHAR(50),
    "sub_id_3" VARCHAR(50),
    "sub_id_4" VARCHAR(50),
    "sub_id_5" VARCHAR(50),
    "origin_link" VARCHAR NOT NULL,
    "clean_link" VARCHAR NOT NULL,
    "convertOrigin" "convert_origin" NOT NULL DEFAULT 'SYSTEM',
    "full_link_system" VARCHAR,
    "short_link" VARCHAR,
    "long_link" VARCHAR,
    "fail_code" INTEGER,
    "user_id" UUID NOT NULL,

    CONSTRAINT "affiliate_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "item_id" BIGINT NOT NULL,
    "shop_id" BIGINT NOT NULL,
    "product_name" VARCHAR NOT NULL,
    "shop_name" VARCHAR NOT NULL,
    "origin_link" VARCHAR NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sales" DOUBLE PRECISION NOT NULL,
    "image_url" VARCHAR NOT NULL,
    "product_link" VARCHAR NOT NULL,
    "rating" VARCHAR(10) NOT NULL,
    "has_seller_commission" BOOLEAN NOT NULL,
    "has_shopee_commission" BOOLEAN NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "seller_com_final" DOUBLE PRECISION NOT NULL,
    "shopee_com_final" DOUBLE PRECISION NOT NULL,
    "seller_rate" DOUBLE PRECISION NOT NULL,
    "shopee_rate" DOUBLE PRECISION NOT NULL,
    "seller_rate_percent" DOUBLE PRECISION NOT NULL,
    "shopee_rate_percent" DOUBLE PRECISION NOT NULL,
    "total_rate_percent" DOUBLE PRECISION NOT NULL,
    "is_extra" BOOLEAN NOT NULL,
    "is_capped" BOOLEAN NOT NULL,
    "is_limit_cap" BOOLEAN NOT NULL,
    "cap" BIGINT NOT NULL,
    "cap_row" BIGINT NOT NULL,
    "cap_after_rate" BIGINT NOT NULL,
    "last_update" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_stats" (
    "id" UUID NOT NULL,
    "current_price" DOUBLE PRECISION NOT NULL,
    "min_price" DOUBLE PRECISION NOT NULL,
    "max_price" DOUBLE PRECISION NOT NULL,
    "avg_price" DOUBLE PRECISION NOT NULL,
    "price_change_7d" DOUBLE PRECISION NOT NULL,
    "price_change_30d" DOUBLE PRECISION NOT NULL,
    "last_price_update" TIMESTAMPTZ(3) NOT NULL,
    "lowest_price_date" TIMESTAMPTZ(3) NOT NULL,
    "highest_price_date" TIMESTAMPTZ(3) NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "price_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "latest_price_history" (
    "id" UUID NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "original_price" DOUBLE PRECISION NOT NULL,
    "discount_percent" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "flashSale" BOOLEAN NOT NULL,
    "recorded_time" TIMESTAMPTZ(3) NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "latest_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "affiliate_link_id_origin_link_idx" ON "affiliate_link"("id", "origin_link");

-- CreateIndex
CREATE UNIQUE INDEX "price_stats_productId_key" ON "price_stats"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "latest_price_history_productId_key" ON "latest_price_history"("productId");

-- AddForeignKey
ALTER TABLE "affiliate_link" ADD CONSTRAINT "affiliate_link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_stats" ADD CONSTRAINT "price_stats_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "latest_price_history" ADD CONSTRAINT "latest_price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
