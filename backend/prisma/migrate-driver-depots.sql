-- Idempotent migration: add storeId to DriverProfile and backfill existing drivers
-- to the default Store (isDefault = true, fallback to first active/lowest id Store).
-- Safe to run multiple times before `prisma db push --accept-data-loss`.

DO $$
DECLARE
  has_driver_table BOOLEAN;
  has_store_id BOOLEAN;
  default_store_id INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'DriverProfile'
  ) INTO has_driver_table;

  IF has_driver_table THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'DriverProfile'
        AND column_name = 'storeId'
    ) INTO has_store_id;

    IF NOT has_store_id THEN
      ALTER TABLE "DriverProfile" ADD COLUMN "storeId" INTEGER;
    END IF;

    SELECT id INTO default_store_id
    FROM "Store"
    ORDER BY "isDefault" DESC, "isActive" DESC, "id" ASC
    LIMIT 1;

    IF default_store_id IS NOT NULL THEN
      UPDATE "DriverProfile"
      SET "storeId" = default_store_id
      WHERE "storeId" IS NULL;
    END IF;
  END IF;
END $$;
