#!/bin/sh
set -e

echo "Syncing Prisma schema with PostgreSQL..."
npx prisma db push --schema=prisma/schema.prisma --skip-generate

echo "Starting DMS Backend..."
exec node dist/index.js
