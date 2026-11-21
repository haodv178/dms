#!/bin/sh
set -e

echo "Migrating legacy Product.stock to DepotStock (if needed)..."
npx prisma db execute --file prisma/migrate-depot-stocks.sql --schema=prisma/schema.prisma || true

echo "Migrating legacy DriverProfile.storeId to default Depot (if needed)..."
npx prisma db execute --file prisma/migrate-driver-depots.sql --schema=prisma/schema.prisma || true

echo "Syncing Prisma schema with PostgreSQL..."
npx prisma db push --schema=prisma/schema.prisma --skip-generate

echo "Starting DMS Backend..."
exec node dist/index.js
