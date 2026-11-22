-- Backfill deliveryDate (YYYY-MM-DD in Asia/Ho_Chi_Minh) and hourDelivery (clamped 9..19)
-- for existing Trip and Order records.
-- Run after `npx prisma db push`.

-- 1. Backfill Trips from createdAt
UPDATE "Trip"
SET
  "deliveryDate" = TO_CHAR("createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
  "hourDelivery" = LEAST(19, GREATEST(9, EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int))
WHERE "deliveryDate" = '2026-01-01';

-- 2. Backfill Orders that belong to a Trip so they match their Trip's slot
UPDATE "Order" o
SET
  "deliveryDate" = t."deliveryDate",
  "hourDelivery" = t."hourDelivery"
FROM "Trip" t
WHERE o."tripId" = t."id"
  AND o."deliveryDate" = '2026-01-01';

-- 3. Backfill standalone Orders (no Trip) from createdAt
UPDATE "Order"
SET
  "deliveryDate" = TO_CHAR("createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
  "hourDelivery" = LEAST(19, GREATEST(9, EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int))
WHERE "deliveryDate" = '2026-01-01';
