# Admin Order Cancellation (`NEW` Orders)

Design specification and implementation summary for allowing `ADMIN` users to cancel `NEW` orders (individually or in bulk) in DMS.

## 1. Agreed Design Decisions

| Decision Area | Agreed Behavior |
|---|---|
| **Representation (`OrderStatus`)** | Soft-cancel by adding a dedicated terminal status `CANCELLED` to `enum OrderStatus` (instead of hard-deleting records). Preserves order history, shows a dedicated `Đã hủy (Cancelled)` tab & badge, and blocks further editing, picking, or trip assignment. |
| **Actor & Status Guard** | Strictly restricted to `Role.ADMIN` and only permitted when `order.status === NEW`. Enforced atomically inside a Prisma transaction (`updateMany` with `where: { id, status: NEW }`) to prevent race conditions with concurrent `startPicking`. |
| **Cancel Reason & Audit Metadata** | Captures an optional free-text `cancelReason` (trimmed, max 500 chars) and `cancelledAt` timestamp in a confirmation dialog before cancelling. |
| **Inventory Restoration** | Because `createOrder` deducts depot stock immediately, cancelling a `NEW` order automatically restores all item quantities back to `DepotStock` at `order.storeId` via `restoreDepotStock` inside the same transaction (guarded by atomic claim so stock is never double-restored). |
| **Payment & Refund Accounting** | • **Prepaid online orders (`paymentMethod !== COD` and `paymentStatus === PAID`)**: stay `PAID` after cancellation and surface a `Cần hoàn tiền <totalAmount>` warning badge (consistent with `REJECTED` orders) so `ADMIN` explicitly marks `REFUNDED` via `PATCH /api/orders/:id/payment-status` after refunding.<br>• **COD orders**: `getOrderCodAmount` returns `0` for `CANCELLED` orders. |
| **Action Scope (Single & Bulk)** | Supports both single-order cancellation (row action on `NEW` orders) and bulk cancellation of selected `NEW` orders from the `OrderTable` contextual mass-action toolbar (non-`NEW` orders in the selection are skipped and reported). |

## 2. Database Schema & Migration

Updated [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma):

- Extended `enum OrderStatus` with `CANCELLED`.
- Added fields on `model Order`:
  - `cancelReason String?`
  - `cancelledAt DateTime?`

### Applying to PostgreSQL

```bash
npm --prefix backend run db:push
```

(In Docker/Azure deployments, `backend/docker-entrypoint.sh` automatically runs `prisma db push --skip-generate` on startup.)

## 3. Backend Changes

- **[`backend/src/controllers/order.controller.ts`](../backend/src/controllers/order.controller.ts)**
  - Added `normalizeCancelReason` helper (trims and caps at 500 characters).
  - Added `cancelOrder` handler (`PATCH /api/orders/:id/cancel`):
    - Validates `orderId`, verifies order exists (`404`) and is in `NEW` status (`400`).
    - Atomically transitions `NEW` → `CANCELLED` with `cancelReason` and `cancelledAt` inside `prisma.$transaction`, returning `409` if the status changed concurrently.
    - Restores `DepotStock` via `restoreDepotStock`.
    - Returns a response message noting stock restoration and, when `paymentMethod !== COD && paymentStatus === PAID`, a prepaid refund reminder.
  - Hardened `startPicking` (`PATCH /api/orders/:id/start-picking`) to require `order.status === NEW` so cancelled orders cannot be moved to `PICKING`.
  - Extended `bulkOrderAction` (`POST /api/orders/bulk-action`) with `action: "CANCEL_ORDER"`:
    - Restricted to `ADMIN` (`WAREHOUSE` remains limited to `START_PICKING` and `COMPLETE_PACKING`).
    - Accepts optional `reason` / `cancelReason`.
    - Filters `NEW` orders, records non-`NEW` orders in `skipped`, atomically cancels each eligible order and restores its depot stock, and includes a prepaid refund count in the summary message if applicable.
- **[`backend/src/routes/order.routes.ts`](../backend/src/routes/order.routes.ts)**
  - Registered `PATCH /api/orders/:id/cancel` with `requireRole(Role.ADMIN)`.

### Example Requests

Single order cancellation:

```json
PATCH /api/orders/42/cancel
{
  "reason": "Khách yêu cầu hủy do đặt trùng đơn"
}
```

Bulk order cancellation:

```json
POST /api/orders/bulk-action
{
  "action": "CANCEL_ORDER",
  "orderIds": [42, 43, 44],
  "reason": "Hủy hàng loạt đơn test"
}
```

## 4. Frontend Changes

- **[`frontend/src/types/dms.ts`](../frontend/src/types/dms.ts)**:
  - Added `CANCELLED` to `OrderStatus`, `STATUS_CONFIG`, and `STATUS_TABS`.
  - Added `CANCEL_ORDER` to `BulkOrderActionType`.
  - Added `cancelReason?: string | null` and `cancelledAt?: string | null` to `Order`.
  - Added `canRoleCancelOrders`, `isOrderCancellable`, and `getOrderRefundAmount`; updated `isOrderRefundPending` to include prepaid `CANCELLED` orders and `getOrderCodAmount` to return `0` for `CANCELLED` orders.
- **[`frontend/src/api/dmsApi.ts`](../frontend/src/api/dmsApi.ts)**:
  - Added `cancelOrder(orderId, reason?)`.
  - Extended `bulkOrderAction(action, orderIds, driverId?, reason?)` to forward optional `reason`.
- **[`frontend/src/components/OrderTable.tsx`](../frontend/src/components/OrderTable.tsx)** & **[`frontend/src/App.tsx`](../frontend/src/App.tsx)**:
  - Added destructive **Hủy đơn** row icon button on `NEW` orders and **Hủy đơn (N)** bulk toolbar button for `ADMIN`.
  - Added Astryx confirmation `Dialog` supporting both single and bulk cancellation with an optional reason `TextInput`, depot stock restoration notice, and prepaid refund warning when applicable.
  - Displays `Lý do hủy` under the `CANCELLED` badge in the status column, updates the payment refund badge to use `getOrderRefundAmount`, treats `CANCELLED` as terminal (`Đã kết thúc`), and refreshes orders, products, and depots after cancellation.
