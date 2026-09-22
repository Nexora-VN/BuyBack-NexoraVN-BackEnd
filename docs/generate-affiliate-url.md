# Generate affiliate links from product-data URL

The backend validates the supplied Shopee URL, calls `product-data.php?url=...`,
checks that the returned origin matches the returned shop/item IDs, and upserts
product data before creating tracking. The product UUID is preserved on update.
Short links remain preferred, with the existing `an_redir` fallback.

## Local setup before browser testing

Use Node 24 and run in the backend directory. Set `DATABASE_URL` explicitly to
**your local database**, including `?schema=aff`, then run:

```sh
pnpm prisma:migrate:deploy
pnpm prisma:generate
pnpm dev
```

The new migration is `20260922090000_product_external_ids_unique`. It refuses to
apply if `(shop_id, item_id)` duplicates exist. It does not merge or delete data.
If it fails, inspect duplicates and their affiliate tracking references before
resolving them; do not automatically delete duplicate products.

## Automated verification

```sh
pnpm test --runInBand
pnpm typecheck
pnpm lint
pnpm build
pnpm prisma:validate
```

The PostgreSQL integration suite requires a disposable local database named
`nexora_generate_test`. It skips other database names. On a fresh isolated
PostgreSQL instance, create that database and set `DATABASE_URL` to it (include
`?schema=aff`), then run:

```sh
pnpm prisma:migrate:deploy
pnpm test:e2e --runTestsByPath test/generate-affiliate.e2e-spec.ts
```

This verifies concurrent generation, unique products, stored rate conversions,
and migration rejection of duplicate data without modifying historical tracking.
External providers are mocked; browser testing checks the real integration.

## Browser checklist

1. Generate `https://s.shopee.vn/5q8MjSk534`: product and affiliate link appear.
2. Repeat: product UUID stays the same, product data refreshes, new link history appears.
3. Verify the product detail and link history screens.
4. Submit an invalid URL and verify the error state.
