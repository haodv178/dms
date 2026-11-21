#!/bin/sh
set -e

echo "Migrating legacy Product.stock to DepotStock (if needed)..."
npx prisma db execute --file prisma/migrate-depot-stocks.sql --schema=prisma/schema.prisma || true

echo "Syncing Prisma schema with PostgreSQL..."
npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss

echo "Starting DMS Backend..."
exec node dist/index.js
