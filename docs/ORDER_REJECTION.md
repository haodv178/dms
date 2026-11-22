# Customer Delivery Rejection (Full & Partial)

Design specification and implementation summary for allowing customers to refuse delivery (in full or in part) at the delivery address in DMS.

## 1. Agreed Design Decisions

| Decision Area | Agreed Behavior |
|---|---|
| **Actor & Entry Point** | Recorded at delivery time (`DELIVERING`) by the assigned `DRIVER` (for orders in their own trips) or by `ADMIN` (any `DELIVERING` order) via `OrderTable` and `TripManagementPage`. |
| **Order Statuses (`OrderStatus`)** | Added two dedicated terminal statuses separate from `FAILED`: `REJECTED` (all ordered units rejected) and `PARTIALLY_REJECTED` (some units rejected, remaining units accepted). Neither status can be edited or reassigned for redelivery. |
| **Granularity** | Supports both **full rejection** and **partial rejection** (per-item `rejectedQuantity` from `0` up to `item.quantity`, with one-click "Từ chối toàn bộ" and "Đặt về 0" shortcuts). Total rejected units must be `>= 1`. |
| **Inventory Restoration** | Rejected quantities are immediately restored to `DepotStock` at the order's `storeId` inside the same Prisma transaction (consistent with `failDelivery`). |
| **Pricing & Payment Accounting** | Preserves original `Order.totalAmount` for reconciliation and records `Order.rejectedAmount` (sum of `item.price * rejectedQuantity`).<br>• **COD + `PARTIALLY_REJECTED`**: auto-marks `paymentStatus = PAID` (`paidAt = now()`) for the accepted net amount (`totalAmount - rejectedAmount`).<br>• **COD + `REJECTED`**: stays `UNPAID` (0₫ collected).<br>• **Prepaid (`PAID`) + `REJECTED` / `PARTIALLY_REJECTED`**: stays `PAID` and surfaces a refund-needed warning badge (`Cần hoàn tiền ...`) so `ADMIN` can explicitly update to `REFUNDED` via `PATCH /api/orders/:id/payment-status` after refunding. |
| **Rejection Reason & Notes** | One primary reason per rejection from `enum RejectionReason` (`NOT_AS_DESCRIBED`, `WRONG_SIZE_OR_VARIANT`, `DAMAGED_OR_EXPIRED`, `WRONG_OR_MISSING_ITEM`, `LATE_DELIVERY`, `CUSTOMER_CHANGED_MIND`, `OTHER`) plus an optional detail note (required when `OTHER` is selected, max 500 chars). No proof photo required. |
| **Trip Completion** | Both `REJECTED` and `PARTIALLY_REJECTED` count as finished stops in `checkAndCompleteTrip`, automatically closing the trip (`COMPLETED`) and freeing the driver (`AVAILABLE`) when no `DELIVERING` orders remain. |

## 2. Database Schema & Migration

Updated `backend/prisma/schema.prisma`:

- Extended `enum OrderStatus` with `PARTIALLY_REJECTED` and `REJECTED`.
- Added `enum RejectionReason`:
  - `NOT_AS_DESCRIBED`
  - `WRONG_SIZE_OR_VARIANT`
  - `DAMAGED_OR_EXPIRED`
  - `WRONG_OR_MISSING_ITEM`
  - `LATE_DELIVERY`
  - `CUSTOMER_CHANGED_MIND`
  - `OTHER`
- Added fields on `model Order`:
  - `rejectionReason RejectionReason?`
  - `rejectionNote String?`
  - `rejectedAt DateTime?`
  - `rejectedAmount Decimal @default(0) @db.Decimal(10, 2)`
- Added field on `model OrderItem`:
  - `rejectedQuantity Int @default(0)`

### Applying to PostgreSQL

```bash
npm --prefix backend run db:push
```

(In Docker/Azure deployments, `backend/docker-entrypoint.sh` automatically runs `prisma db push --skip-generate` on startup.)

## 3. Backend Changes

- **`backend/src/controllers/order.controller.ts`**
  - Added `parseRejectionReason` validator.
  - Added `rejectDelivery` handler (`PATCH /api/orders/:id/reject-delivery`):
    - Enforces `DELIVERING` status and driver ownership (`order.trip.driverId === req.user.id` for `DRIVER`).
    - Validates `reason`, conditional `note` (required for `OTHER`), and per-item `rejectedItems` (or `rejectAll: true`).
    - Atomically updates `OrderItem.rejectedQuantity`, restores `DepotStock` via `restoreDepotStock`, updates `Order` status (`REJECTED` vs `PARTIALLY_REJECTED`), `rejectedAmount`, `rejectionReason`, `rejectionNote`, `rejectedAt`, COD payment status (for partial COD), and calls `checkAndCompleteTrip`.
  - Added `DELIVERING` status guards to `completeDelivery` and `failDelivery` to prevent overwriting already-completed or rejected orders (and prevent double stock restoration).
- **`backend/src/routes/order.routes.ts`**
  - Registered `PATCH /api/orders/:id/reject-delivery` with `requireRole(Role.ADMIN, Role.DRIVER)`.

### Example Request

```json
PATCH /api/orders/42/reject-delivery
{
  "reason": "WRONG_SIZE_OR_VARIANT",
  "note": "Khách chỉ nhận 2 hộp đúng cỡ, trả lại 1 hộp sai quy cách",
  "rejectedItems": [
    { "orderItemId": 101, "rejectedQuantity": 1 },
    { "orderItemId": 102, "rejectedQuantity": 0 }
  ]
}
```

## 4. Frontend Changes

- **`frontend/src/types/dms.ts`**:
  - Added `PARTIALLY_REJECTED` and `REJECTED` to `OrderStatus`, `STATUS_CONFIG`, and `STATUS_TABS`.
  - Added `RejectionReason`, `REJECTION_REASONS`, and `REJECTION_REASON_CONFIG`.
  - Added `rejectedQuantity`, `rejectionReason`, `rejectionNote`, `rejectedAt`, `rejectedAmount` to `OrderItem` / `Order`.
  - Added helpers `getOrderRejectedAmount`, `getOrderNetAmount`, `isOrderRejectedStatus`, `isOrderRefundPending`, and updated `getOrderCodAmount` to account for rejected orders/amounts.
- **`frontend/src/api/dmsApi.ts`**:
  - Added `RejectDeliveryPayload` and `rejectDeliveryOrder`.
- **`frontend/src/components/RejectDeliveryModal.tsx`** (new):
  - Astryx `Dialog` modal allowing `DRIVER` / `ADMIN` to select a rejection reason, enter notes, adjust rejected quantity per item with quick **Từ chối toàn bộ** / **Đặt về 0** actions, and preview the resulting status (`REJECTED` / `PARTIALLY_REJECTED`), returned amount, net COD to collect, or prepaid refund warning.
- **`frontend/src/components/OrderTable.tsx`**, **`frontend/src/components/TripManagementPage.tsx`**, **`frontend/src/App.tsx`**:
  - Added "Khách từ chối nhận hàng" action button on `DELIVERING` orders/stops wired to `RejectDeliveryModal`.
  - Displays per-item rejected counts, returned/net amounts, rejection reason/note, and `Cần hoàn tiền` warning badges for prepaid orders.
  - Updated trip completion progress counters and order status tab counts to include `REJECTED` and `PARTIALLY_REJECTED`.
