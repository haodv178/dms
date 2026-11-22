-- Backfill paymentStatus and paidAt for existing COMPLETED COD orders
-- Run after `npx prisma db push`
UPDATE "Order"
SET
  "paymentStatus" = 'PAID',
  "paidAt" = COALESCE("paidAt", "updatedAt")
WHERE
  "status" = 'COMPLETED'
  AND "paymentMethod" = 'COD'
  AND "paymentStatus" = 'UNPAID';
