# Delivery Timeslots (11 Daily Slots: 9–19)

Design specification and implementation summary for scheduling orders and trips into 11 hourly delivery timeslots per day (`9` through `19`) with per-slot driver conflict enforcement.

## 1. Agreed Design Decisions

| Decision Area | Agreed Behavior |
|---|---|
| **Timeslot Scope** | Store both `deliveryDate` (`YYYY-MM-DD`, Asia/Ho_Chi_Minh) and `hourDelivery` (`Int`, `9..19`) on `Order` and `Trip`. All trip grouping and driver conflict checks are scoped per `(deliveryDate, hourDelivery)`. |
| **11 Daily Slots** | Valid `hourDelivery` values are `9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19`, displayed in the UI as 1-hour windows (`09:00 - 10:00` through `19:00 - 20:00`) alongside `deliveryDate`. |
| **Trip Slot Invariant** | Every `Trip` has a single `(deliveryDate, hourDelivery)` and all orders assigned to that trip must share the exact same `(deliveryDate, hourDelivery)`. `POST /api/trips/optimize` rejects mixed-slot order lists with `400`. |
| **Driver Conflict Rule** | One driver cannot be assigned to more than 1 **active** trip (`ASSIGNED` or `IN_TRANSIT`) in the same `(deliveryDate, hourDelivery)`. Drivers **can** hold multiple active trips across *different* timeslots on the same day, and if they finish a trip early (`COMPLETED`), they may take another trip in that same slot. |
| **Auto-Assign Driver** | When creating a trip without an explicit `driverId`, the backend selects an active, non-`OFFLINE` driver in the same depot who has no active trip in that `(deliveryDate, hourDelivery)` (preferring `AVAILABLE` drivers and fewest active trips). |
| **Direct & Bulk Order Assignment** | Single `assignDriverToOrder` appends to the driver's existing active trip matching `(storeId, deliveryDate, hourDelivery)`, or creates a new trip for that slot. Bulk `ASSIGN_DRIVER` automatically groups selected eligible orders by `(deliveryDate, hourDelivery)` and creates/appends 1 trip per slot for that driver. |
| **Order Defaults, Editing & Backfill** | New orders default to today (`Asia/Ho_Chi_Minh`) and the current hour clamped to `9..19` in both UI and API fallback. `deliveryDate` and `hourDelivery` are editable in `NEW`, `PICKING`, and `PACKED` statuses. Existing DB rows are backfilled from `createdAt` (clamped `9..19`); seed scripts distribute orders across all 11 slots. |
| **Python OR-Tools Solver** | Unchanged (`python-solver/main.py`) — since all orders in a trip share one timeslot, OR-Tools continues distance-only stop-sequence optimization per trip. |

## 2. Database Schema & Migration

Updated `backend/prisma/schema.prisma`:

- Added fields and index on `model Order`:
  - `deliveryDate String @default("2026-01-01")` (`YYYY-MM-DD`, `Asia/Ho_Chi_Minh`)
  - `hourDelivery Int @default(9)` (`9..19`)
  - `@@index([deliveryDate, hourDelivery])`
- Added fields and indexes on `model Trip`:
  - `deliveryDate String @default("2026-01-01")`
  - `hourDelivery Int @default(9)`
  - `@@index([deliveryDate, hourDelivery])`
  - `@@index([driverId, deliveryDate, hourDelivery, status])`

### Applying to PostgreSQL

```bash
npm --prefix backend run db:push
psql "$DATABASE_URL" -f backend/prisma/migrate-delivery-timeslots.sql
```

`backend/prisma/migrate-delivery-timeslots.sql` backfills existing `Trip` and `Order` records from `createdAt` in `Asia/Ho_Chi_Minh` (clamping `hourDelivery` into `9..19`) and ensures orders already attached to a trip match their trip's `(deliveryDate, hourDelivery)`.

## 3. Backend Changes

- **`backend/src/lib/timeslot.ts`**
  - Constants (`DELIVERY_HOURS`, `MIN_DELIVERY_HOUR = 9`, `MAX_DELIVERY_HOUR = 19`), Vietnam-timezone default helpers (`getVietnamNowParts`, `getDefaultDeliverySlot`), strict validators (`parseDeliveryDate`, `parseHourDelivery`), and `formatTimeslotLabel`.
- **`backend/src/controllers/order.controller.ts`**
  - `getOrders`: supports `?deliveryDate=YYYY-MM-DD&hourDelivery=9..19` query filters.
  - `createOrder` & `updateOrder`: validates and saves `deliveryDate` and `hourDelivery` (defaults to today + clamped current hour on create; editable in `NEW`, `PICKING`, `PACKED`).
  - `assignDriverToOrder`: scopes existing active trip lookup to `(driverId, storeId, deliveryDate, hourDelivery)` and sets `(deliveryDate, hourDelivery)` when creating a new trip.
  - `bulkOrderAction` (`ASSIGN_DRIVER`): groups eligible orders by `(deliveryDate, hourDelivery)` and creates/appends 1 trip per slot for the selected driver.
- **`backend/src/controllers/trip.controller.ts`**
  - `optimizeAndCreateTrip`: validates all selected `PACKED` orders share one `(deliveryDate, hourDelivery)`; blocks manual assignment if the driver already has an active trip in that slot; updates auto-assign to pick any active, non-`OFFLINE` depot driver free in that slot.
  - `reassignTripDriver`: rejects with `400` if the target driver already has another active trip in the trip's `(deliveryDate, hourDelivery)`.
  - `getTrips` & `getMyActiveTrip`: supports `deliveryDate` and `hourDelivery` filters and orders active trips chronologically by slot.
- **`backend/src/controllers/driver.controller.ts`**
  - Returns all `activeTrips` (including `deliveryDate` and `hourDelivery`) on each serialized driver alongside `activeTrip` so dispatch UIs can detect per-slot conflicts.
- **`backend/src/lib/seeder.ts`** & **`backend/prisma/seed-orders.ts`**
  - Assigns today's `deliveryDate` and distributes `hourDelivery` across `9..19`.

## 4. Frontend Changes

- **`frontend/src/types/dms.ts`** & **`frontend/src/api/dmsApi.ts`**
  - Added `DELIVERY_HOURS`, `DeliveryHour`, `ISODateString`, `toIsoDateString`, `formatTimeslot`, `formatDeliveryDateShort`, `getDefaultDeliveryDate`, `getDefaultDeliveryHour`, `createInitialOrderForm`, `getDriverActiveTrips`, and `findDriverSlotConflict`.
  - Added `deliveryDate` and `hourDelivery` to `Order`, `Trip`, `OrderFormState`, and `DriverActiveTrip`, plus `activeTrips` to `Driver`, and serialized them in `serializeOrderPayload`.
- **`frontend/src/components/OrderFormModal.tsx`**
  - Added a delivery schedule panel with Astryx `DateInput` (`Ngày giao hàng`) and 11-slot `Selector` (`09:00 - 10:00` … `19:00 - 20:00`).
- **`frontend/src/components/OrderTable.tsx`** & **`frontend/src/App.tsx`**
  - Added Date (`DateInput` with clear) and Timeslot (`Selector`) filters plus a dedicated `Khung Giờ Giao` column.
- **`frontend/src/components/CreateTripModal.tsx`**
  - Added Date + Timeslot selectors (showing per-slot `PACKED` order counts) and filters both eligible orders and depot drivers by **Depot + Delivery Date + Timeslot** (allowing drivers booked in other slots to be selected).
- **`frontend/src/components/TripManagementPage.tsx`** & **`frontend/src/components/ActiveTripPanel.tsx`**
  - Added Date + Timeslot filters on the Trips page and timeslot/date badges on trip cards, detail headers, and the active trip panel.
- **`frontend/src/components/ReassignTripDriverModal.tsx`**, **`AssignDriverModal.tsx`**, & **`BulkAssignDriverModal.tsx`**
  - Disables drivers with an active trip conflict in the trip's slot in `ReassignTripDriverModal`.
  - Shows same-slot trip merge vs new-trip badges per driver in `AssignDriverModal`.
  - Displays per-slot trip breakdown badges in `BulkAssignDriverModal`.
