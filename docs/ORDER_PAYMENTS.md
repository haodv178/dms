# Multi-Payment Support for Orders

Design specification and implementation summary for supporting multiple order payment methods alongside COD in DMS.

## 1. Agreed Design Decisions

| Decision Area | Agreed Behavior |
|---|---|
| **Payment Methods (`PaymentMethod`)** | Fixed Prisma enum: `COD` (default), `CREDIT_CARD`, `MOMO`, `BANK_TRANSFER`, `ZALOPAY`, `VNPAY`. |
| **Processing Scope** | Internal DMS tracking only — records payment method, status, paid timestamp, and optional transaction reference without external payment gateway API calls or webhooks. |
| **Payment Status (`PaymentStatus`)** | Fixed Prisma enum: `UNPAID` (default), `PAID`, `REFUNDED`, plus nullable `paidAt` (`DateTime?`) and optional `paymentReference` (`String?`, max 120 chars). |
| **Creation Defaults** | `COD` defaults to `UNPAID` (`paidAt = null`). Non-COD methods default to `PAID` (`paidAt = now()`), overridable by `ADMIN` (e.g., pending `BANK_TRANSFER` as `UNPAID`). |
| **Delivery Lifecycle** | `completeDelivery` (single and bulk `COMPLETE_DELIVERY`) automatically marks `COD` + `UNPAID` orders as `PAID` with `paidAt = now()`. `failDelivery` leaves `paymentStatus` unchanged so `ADMIN` can explicitly mark `REFUNDED` when refunded. |
| **Permissions & Editing Rules** | `paymentMethod`, `paymentStatus`, and `paymentReference` are editable by `ADMIN` via `PUT /api/orders/:id` while the order is in `NEW`, `PICKING`, or `PACKED`. A dedicated `ADMIN`-only endpoint `PATCH /api/orders/:id/payment-status` updates `paymentStatus` (and optional `paymentReference`) in **any** order status. |
| **COD & Driver / Trip UX** | `Tổng COD` sums **only** `COD` + `UNPAID` orders (`getOrderCodAmount`). Prepaid non-COD orders show their method badge + `"Đã thanh toán (0₫ thu hộ)"`. Unpaid non-COD orders show a warning badge (`Chưa thanh toán`). |
| **Filtering & Seed Data** | `OrderTable` displays a dedicated `Thanh Toán` column, supports filtering by `paymentMethod` and `paymentStatus`, searches by `paymentReference`, and `seed-orders.ts` generates a realistic mix of payment methods and statuses. |

## 2. Database Schema & Migration

Updated `backend/prisma/schema.prisma`:

- Added `enum PaymentMethod { COD CREDIT_CARD MOMO BANK_TRANSFER ZALOPAY VNPAY }`
- Added `enum PaymentStatus { UNPAID PAID REFUNDED }`
- Added fields on `model Order`:
  - `paymentMethod PaymentMethod @default(COD)`
  - `paymentStatus PaymentStatus @default(UNPAID)`
  - `paidAt DateTime?`
  - `paymentReference String?`

### Applying to PostgreSQL

```bash
npm --prefix backend run db:push
```

To backfill existing `COMPLETED` COD orders as `PAID`, run `backend/prisma/migrate-order-payments.sql`:

```sql
UPDATE "Order"
SET
  "paymentStatus" = 'PAID',
  "paidAt" = COALESCE("paidAt", "updatedAt")
WHERE
  "status" = 'COMPLETED'
  AND "paymentMethod" = 'COD'
  AND "paymentStatus" = 'UNPAID';
```

## 3. Backend Changes

- **`backend/src/controllers/order.controller.ts`**
  - Added enum/reference parsers (`parsePaymentMethod`, `parsePaymentStatus`, `normalizePaymentReference`) and `resolvePaidAt` helper.
  - `getOrders`: supports `?paymentMethod=...&paymentStatus=...` query filters.
  - `createOrder`: accepts `paymentMethod`, `paymentStatus`, `paymentReference` with smart defaults.
  - `updateOrder`: accepts optional `paymentMethod`, `paymentStatus`, `paymentReference` for editable statuses (`NEW`, `PICKING`, `PACKED`).
  - `updateOrderPaymentStatus`: new `ADMIN`-only handler to update `paymentStatus` and optional `paymentReference` in any order status.
  - `completeDelivery` & `bulkOrderAction` (`COMPLETE_DELIVERY`): auto-marks `COD` + `UNPAID` orders as `PAID` with `paidAt = new Date()`.
- **`backend/src/routes/order.routes.ts`**
  - Registered `PATCH /api/orders/:id/payment-status` (`requireRole(Role.ADMIN)`).
- **`backend/prisma/seed-orders.ts`**
  - Seeds orders across all 6 payment methods with realistic `PAID`/`UNPAID` statuses and transaction references (`CC-...`, `MOMO-...`, `FT-...`, `ZP-...`, `VNP-...`).

## 4. Frontend Changes

- **`frontend/src/types/dms.ts`**: Added `PaymentMethod`, `PaymentStatus`, `PAYMENT_METHOD_CONFIG`, `PAYMENT_STATUS_CONFIG`, `defaultPaymentStatusForMethod`, `getOrderCodAmount`, `isOrderPrepaid`, and `isOrderUnpaidOnline`.
- **`frontend/src/api/dmsApi.ts`**: Serializes payment fields in `createOrder` / `updateOrder` and added `updateOrderPaymentStatus`.
- **`frontend/src/components/OrderFormModal.tsx`**: Added payment info panel with method selector (auto-switching default status when toggling COD vs online), payment status selector, and optional `Mã giao dịch` field.
- **`frontend/src/components/OrderTable.tsx`** & **`frontend/src/App.tsx`**:
  - Added `Thanh Toán` column showing method badge, status badge, and `paymentReference`.
  - Added payment method and payment status filter dropdowns plus search matching on `paymentReference`.
  - Added Admin dialog to update `paymentStatus` and `paymentReference` on any order.
- **`frontend/src/components/TripManagementPage.tsx`**, **`CreateTripModal.tsx`**, **`BulkAssignDriverModal.tsx`**, **`RouteMap.tsx`**, **`ActiveTripPanel.tsx`**:
  - `Tổng COD` calculations now use `getOrderCodAmount(order)` (summing only unpaid COD orders).
  - Stop cards and map popups display payment method badges, COD amount to collect, `"Đã thanh toán (0₫ thu hộ)"` for prepaid orders, and warning badges for unpaid online orders.
