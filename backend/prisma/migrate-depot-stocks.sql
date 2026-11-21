-- Idempotent migration: copy legacy Product.stock into DepotStock for the default Store
-- Safe to run multiple times before `prisma db push --accept-data-loss`.

CREATE TABLE IF NOT EXISTS "DepotStock" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepotStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DepotStock_storeId_productId_key"
  ON "DepotStock"("storeId", "productId");
CREATE INDEX IF NOT EXISTS "DepotStock_storeId_idx"
  ON "DepotStock"("storeId");
CREATE INDEX IF NOT EXISTS "DepotStock_productId_idx"
  ON "DepotStock"("productId");

DO $$
DECLARE
  has_legacy_stock BOOLEAN;
  default_store_id INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Product'
      AND column_name = 'stock'
  ) INTO has_legacy_stock;

  IF has_legacy_stock THEN
    SELECT id INTO default_store_id
    FROM "Store"
    ORDER BY "isDefault" DESC, "isActive" DESC, "id" ASC
    LIMIT 1;

    IF default_store_id IS NOT NULL THEN
      INSERT INTO "DepotStock" ("storeId", "productId", "quantity", "updatedAt")
      SELECT default_store_id, p."id", GREATEST(COALESCE(p."stock", 0), 0), CURRENT_TIMESTAMP
      FROM "Product" p
      ON CONFLICT ("storeId", "productId") DO NOTHING;
    END IF;
  END IF;
END $$;
