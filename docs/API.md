# Đặc Tả REST API & Micro-service Google OR-Tools

> Quay lại: [README.md](../README.md) | Xem thêm: [ARCHITECTURE.md](ARCHITECTURE.md) · [DEVELOPMENT.md](DEVELOPMENT.md)

---

## Mục Lục

1. [Cơ Chế Xác Thực & Bảo Mật](#1-cơ-chế-xác-thực--bảo-mật)
2. [Backend Node.js REST API](#2-backend-nodejs-rest-api)
   - [2.1. Xác thực & Hệ thống](#21-xác-thực--hệ-thống)
   - [2.2. Quản lý Tài khoản (`ADMIN` only)](#22-quản-lý-tài-khoản-admin-only)
   - [2.3. Quản lý Đơn hàng](#23-quản-lý-đơn-hàng)
   - [2.4. Quản lý Sản phẩm & Tồn kho](#24-quản-lý-sản-phẩm--tồn-kho)
   - [2.5. Quản lý Tài xế (`ADMIN` only)](#25-quản-lý-tài-xế-admin-only)
   - [2.6. Quản lý Điểm xuất phát (Multi-Depot)](#26-quản-lý-điểm-xuất-phát-multi-depot)
   - [2.7. Quản lý Chuyến xe & Tối ưu Lộ trình](#27-quản-lý-chuyến-xe--tối-ưu-lộ-trình)
3. [Micro-service Python Google OR-Tools VRP Solver](#3-micro-service-python-google-or-tools-vrp-solver)

---

## 1. Cơ Chế Xác Thực & Bảo Mật

Trừ `GET /api/health` và các endpoint đăng nhập/làm mới phiên, toàn bộ API nghiệp vụ đều yêu cầu header `Authorization: Bearer <accessToken>`:

- **JWT Access Token:** Thời hạn ngắn (`15m`), lưu trong bộ nhớ phía client (không lưu `localStorage`).
- **Refresh Token:** Thời hạn `7d`, lưu trong cookie `HttpOnly` tên `dms_refresh_token` (`path: /api/auth`; `SameSite=Lax` ở local dev và `SameSite=None; Secure` ở production cross-origin). Database lưu hash **SHA-256** trong bảng `RefreshToken`.
- **Token Rotation & Reuse Detection:** Mỗi lần gọi `POST /api/auth/refresh`, token cũ bị thu hồi và cấp token mới trong Prisma transaction. Nếu phát hiện tái sử dụng token đã thu hồi, hệ thống thu hồi toàn bộ phiên của user.
- **Mật khẩu & Rate Limit:** Băm bằng `bcryptjs` (cost 10), yêu cầu tối thiểu 6 ký tự cho mật khẩu mới. Endpoint đăng nhập giới hạn **15 lần sai / 15 phút** (`loginRateLimiter`).
- **Data Scoping cho `DRIVER`:** Tài xế chỉ xem được các đơn hàng và chuyến xe gắn với `driverId` của chính mình, và chỉ được cập nhật trạng thái giao hàng cho các đơn/chuyến đó.

---

## 2. Backend Node.js REST API

Base URL local: `http://localhost:3000/api`

### 2.1. Xác thực & Hệ thống

| Method | Endpoint | Phân quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Kiểm tra trạng thái hoạt động của Backend |
| `POST` | `/api/auth/login` | Public (Rate-limited) | Đăng nhập `{ email, password }`, trả `accessToken`, `user` và set cookie `dms_refresh_token` |
| `POST` | `/api/auth/refresh` | Cookie | Xoay vòng `dms_refresh_token` và cấp `accessToken` mới |
| `POST` | `/api/auth/logout` | Cookie | Thu hồi refresh token hiện tại trong DB và xóa cookie |
| `GET` | `/api/auth/me` | Authenticated | Lấy thông tin tài khoản đang đăng nhập |
| `POST` | `/api/auth/change-password` | Authenticated | Tự đổi mật khẩu `{ currentPassword, newPassword }`, thu hồi các phiên cũ và cấp phiên mới |
| `GET` | `/api/system/overview` | Authenticated | Lấy danh sách `stores` (trả thêm `users` nếu là `ADMIN`) |
| `POST` | `/api/seed` | `ADMIN` | Reset và nạp lại dữ liệu mẫu: 1 depot mặc định (`DEP-001`), 3 tài khoản chính + 5 tài xế kèm `DriverProfile`, 16 sản phẩm (`DepotStock`) & 10 đơn hàng (`ORD-101` ➔ `ORD-110`) |

---

### 2.2. Quản lý Tài khoản (`ADMIN` only)

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/users` | Danh sách tài khoản có phân trang (`page`, `limit`), tìm kiếm (`search`), lọc `role` & `status` (`ACTIVE\|INACTIVE`), kèm `summary` |
| `POST` | `/api/users` | Tạo tài khoản mới (`name`, `email`, `password` ≥ 6 ký tự, `role`, `isActive`) |
| `PUT` | `/api/users/:id` | Cập nhật `name`, `email`, `role`, `isActive` (chặn tự khóa/tự hạ quyền; tự thu hồi phiên khi vô hiệu hóa hoặc đổi vai trò và đồng bộ `DriverProfile.isActive`) |
| `PATCH` | `/api/users/:id/reset-password` | Đặt lại mật khẩu `{ newPassword }` và thu hồi toàn bộ refresh token cũ |
| `DELETE` | `/api/users/:id` | Xóa tài khoản (chặn tự xóa bản thân hoặc xóa tài khoản đã có lịch sử chuyến xe) |

---

### 2.3. Quản lý Đơn hàng

| Method | Endpoint | Phân quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/orders` | `ADMIN`, `WAREHOUSE`, `DRIVER` | Danh sách đơn hàng sắp xếp `createdAt DESC` (tie-breaker `id DESC`), lọc `?status=NEW\|PICKING\|PACKED\|DELIVERING\|COMPLETED\|PARTIALLY_REJECTED\|REJECTED\|FAILED\|CANCELLED`, `?paymentMethod=COD\|CREDIT_CARD\|MOMO\|BANK_TRANSFER\|ZALOPAY\|VNPAY`, `?paymentStatus=UNPAID\|PAID\|REFUNDED`. `DRIVER` chỉ thấy đơn của mình |
| `GET` | `/api/orders/:id` | `ADMIN`, `WAREHOUSE`, `DRIVER` | Chi tiết đơn hàng kèm `items` (có scoping cho `DRIVER`) |
| `POST` | `/api/orders` | `ADMIN` | Tạo đơn mới (mặc định dùng depot `isDefault`). Chặn `400` nếu Haversine > 5 km hoặc thiếu tồn kho tại `DepotStock`; trừ tồn atomic trong transaction; tự tra cứu giá từ `Product` và tính `totalAmount`. Hỗ trợ `paymentMethod` (mặc định `COD`), `paymentStatus` (`COD` ➔ `UNPAID`, online ➔ `PAID`), và `paymentReference` |
| `PUT` | `/api/orders/:id` | `ADMIN` | Sửa đơn ở trạng thái `NEW` / `PICKING` / `PACKED` (trả `400` nếu đã `DELIVERING`/`COMPLETED`/`FAILED`). Hỗ trợ đổi depot, cập nhật `paymentMethod`/`paymentStatus`/`paymentReference`, kiểm tra ≤ 5 km, hoàn tồn depot cũ & trừ tồn depot mới trong cùng transaction |
| `PATCH` | `/api/orders/:id/payment-status` | `ADMIN` | Cập nhật `paymentStatus` (`UNPAID` / `PAID` / `REFUNDED`) và `paymentReference` (tùy chọn) ở **mọi trạng thái đơn**; tự động đồng bộ `paidAt` |
| `PATCH` | `/api/orders/:id/cancel` | `ADMIN` | Hủy đơn ở trạng thái `NEW` (`NEW` ➔ `CANCELLED`) với `{ reason? }`; hoàn tồn kho atomic về depot và nhắc hoàn tiền nếu đơn đã thanh toán trước (`PAID`) |
| `PATCH` | `/api/orders/:id/start-picking` | `ADMIN`, `WAREHOUSE` | Chuyển `NEW` ➔ `PICKING` (chặn `400` nếu đơn không ở trạng thái `NEW`) |
| `PATCH` | `/api/orders/:id/complete-packing` | `ADMIN`, `WAREHOUSE` | Chuyển `PICKING` ➔ `PACKED` |
| `PATCH` | `/api/orders/:id/assign-driver` | `ADMIN` | Gán/đổi (`{ "driverId": 3 }`) hoặc bỏ gán (`{ "driverId": null }`) tài xế trực tiếp (chi tiết bên dưới) |
| `POST` | `/api/orders/bulk-action` | `ADMIN`, `WAREHOUSE` | Thực hiện thao tác hàng loạt `{ action, orderIds, driverId?, reason? }` trong một transaction (chi tiết bên dưới) |
| `PATCH` | `/api/orders/:id/complete-delivery` | `ADMIN`, `DRIVER` | Chuyển `DELIVERING` ➔ `COMPLETED`; tự đánh dấu `paymentStatus = PAID` (và `paidAt`) cho đơn `COD` đang `UNPAID`; tự đóng `Trip` (`COMPLETED`) và giải phóng tài xế về `AVAILABLE` khi hoàn tất đơn cuối |
| `PATCH` | `/api/orders/:id/fail-delivery` | `ADMIN`, `DRIVER` | Chuyển `DELIVERING` ➔ `FAILED`; tự hoàn tồn kho về depot, đóng `Trip` và giải phóng tài xế nếu là đơn cuối (giữ nguyên `paymentStatus` để Admin chủ động đánh dấu `REFUNDED` nếu cần) |
| `PATCH` | `/api/orders/:id/reject-delivery` | `ADMIN`, `DRIVER` | Ghi nhận khách hàng từ chối nhận hàng toàn bộ (`REJECTED`) hoặc một phần (`PARTIALLY_REJECTED`) với `{ reason, note?, rejectedItems }` (hoặc `rejectAll: true`); hoàn tồn kho ngay theo số lượng bị từ chối, lưu `rejectedAmount`, tự đánh dấu `PAID` cho đơn COD nhận một phần, giữ `PAID` cho đơn thanh toán trước để Admin đối soát hoàn tiền, và tự đóng `Trip` nếu không còn đơn `DELIVERING` |

**Chi tiết `PATCH /api/orders/:id/assign-driver`:**
- **Gán / Đổi tài xế (`{ "driverId": 3 }`):** Hỗ trợ đơn `PACKED`, `DELIVERING`, `FAILED` (giao lại sẽ tự kiểm tra và trừ lại tồn kho tại depot). Yêu cầu tài xế đang `isActive`, không `OFFLINE`, và **thuộc đúng depot của đơn (`driverProfile.storeId === order.storeId`, trả `400` nếu lệch)**. Tự ghép vào chuyến đang hoạt động cùng depot ở cuối lộ trình (`max(deliverySequence) + 1`) hoặc tạo `Trip` mới, chuyển đơn sang `DELIVERING` và tài xế sang `ON_DELIVERY`.
- **Bỏ gán tài xế (`{ "driverId": null }`):** Áp dụng cho đơn `DELIVERING`; gỡ `tripId`/`deliverySequence`, đưa đơn về `PACKED`.
- **Đồng bộ chuyến cũ:** Tự đánh lại thứ tự `1..N`, xóa `totalDistance` cũ, xóa chuyến rỗng (hoặc đóng `COMPLETED` nếu không còn đơn `DELIVERING`) và chuyển tài xế cũ về `AVAILABLE` nếu không còn chuyến hoạt động khác.

**Chi tiết `POST /api/orders/bulk-action`:**
- Hỗ trợ các `action`: `START_PICKING`, `COMPLETE_PACKING`, `ASSIGN_DRIVER`, `UNASSIGN_DRIVER`, `COMPLETE_DELIVERY`, `FAIL_DELIVERY`, `CANCEL_ORDER` (trong đó `WAREHOUSE` chỉ được thực hiện `START_PICKING` và `COMPLETE_PACKING`; `CANCEL_ORDER` chỉ dành cho `ADMIN` đối với đơn `NEW`, hỗ trợ `reason?` và tự hoàn tồn kho về depot).
- Kiểm tra điều kiện từng đơn phía server, tự động bỏ qua đơn không hợp lệ (hoặc khác depot khi `ASSIGN_DRIVER`), đồng bộ `Trip` và `DriverProfile` một lần, trả về `{ updatedCount, updatedOrders, skipped: [{ id, orderCode, reason }], message }`.

---

### 2.4. Quản lý Sản phẩm & Tồn kho

| Method | Endpoint | Phân quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | `ADMIN`, `WAREHOUSE` | Phân trang server (`page`, `limit` `1–100`), tìm kiếm (`search`), lọc `category`, `storeId` (`ALL` hoặc ID), `activeOnly`. Trả về `stock`, `totalStock`, `depotStocks`, `pagination`, `summary` |
| `GET` | `/api/products/:id` | `ADMIN`, `WAREHOUSE` | Chi tiết sản phẩm kèm phân bổ `depotStocks` (hỗ trợ `?storeId=`) |
| `POST` | `/api/products` | `ADMIN` | Tạo sản phẩm mới (tự sinh `SKU-...` nếu bỏ trống, `409` nếu trùng SKU) kèm tồn ban đầu `depotStocks: [{ storeId, quantity }]` |
| `PUT` | `/api/products/:id` | `ADMIN` | Cập nhật thông tin sản phẩm, `depotStocks` theo từng depot và `isActive` |
| `DELETE` | `/api/products/:id` | `ADMIN` | Xóa sản phẩm (cascade xóa `DepotStock`) |

---

### 2.5. Quản lý Tài xế (`ADMIN` only)

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/drivers` | Danh sách tài xế (gộp `User`, `DriverProfile`, `store`, `activeTrip`, `totalTrips`); hỗ trợ `page`, `limit`, `search`, `storeId`, `status`, `vehicleType`, `availableOnly`; trả về `data`, `pagination`, `summary` |
| `GET` | `/api/drivers/:id` | Chi tiết tài xế kèm thông tin depot |
| `POST` | `/api/drivers` | Tạo tài khoản `DRIVER` kèm `DriverProfile` (**bắt buộc `storeId`** thuộc depot đang hoạt động; `409` nếu trùng email) |
| `PUT` | `/api/drivers/:id` | Cập nhật tài khoản, mật khẩu tùy chọn, `storeId`, phương tiện, trạng thái & `isActive`. **Chặn đổi depot (`400`)** nếu có chuyến `ASSIGNED`/`IN_TRANSIT` hoặc depot đích ngừng hoạt động |
| `DELETE` | `/api/drivers/:id` | Chặn xóa (`400`) nếu còn chuyến `ASSIGNED`/`IN_TRANSIT`; tự gỡ `Trip.driverId = null` ở các chuyến đã hoàn tất trước khi xóa |

---

### 2.6. Quản lý Điểm xuất phát (Multi-Depot)

| Method | Endpoint | Phân quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stores` | `ADMIN`, `WAREHOUSE`, `DRIVER` | Danh sách depot kèm thống kê (`ordersCount`, `tripsCount`, `driversCount`, `totalStock`, `inStockSkuCount`, `lowStockSkuCount`), phân trang & lọc `search`, `status`, `activeOnly` |
| `GET` | `/api/stores/:id` | `ADMIN`, `WAREHOUSE`, `DRIVER` | Chi tiết depot kèm thống kê tồn kho và số lượng tài xế |
| `GET` | `/api/stores/:id/inventory` | `ADMIN`, `WAREHOUSE` | Danh sách sản phẩm & tồn kho tại riêng depot `:id` (`page`, `limit`, `search`, `category`, `stockFilter=ALL\|IN_STOCK\|LOW_STOCK\|OUT_OF_STOCK`) |
| `PUT` | `/api/stores/:id/inventory` | `ADMIN`, `WAREHOUSE` | Cập nhật hàng loạt tồn kho tại depot `:id`: `{ "items": [{ "productId": 1, "quantity": 50 }] }` |
| `POST` | `/api/stores` | `ADMIN` | Tạo depot mới (tự sinh mã `DEP-001`... nếu bỏ trống); nếu `isDefault: true` sẽ tự đồng bộ duy nhất 1 kho mặc định |
| `PUT` | `/api/stores/:id` | `ADMIN` | Cập nhật depot; chặn tắt hoạt động hoặc bỏ mặc định khi chưa có depot mặc định thay thế |
| `PATCH` | `/api/stores/:id/set-default` | `ADMIN` | Đặt nhanh depot làm mặc định (tự bật `isActive: true` và gỡ mặc định cũ) |
| `DELETE` | `/api/stores/:id` | `ADMIN` | Chặn xóa (`400`) nếu là kho mặc định hoặc vẫn còn đơn hàng, chuyến xe, tài xế gắn liền |

---

### 2.7. Quản lý Chuyến xe & Tối ưu Lộ trình

| Method | Endpoint | Phân quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/trips` | `ADMIN`, `WAREHOUSE`, `DRIVER` | Danh sách chuyến mới nhất trước, kèm `store`, `driver.driverProfile`, `orders` theo `deliverySequence`; lọc `status`, `search`. `DRIVER` chỉ thấy chuyến của mình |
| `GET` | `/api/trips/my-active` | `ADMIN`, `DRIVER` | Lấy chuyến đang thực hiện (hoặc chuyến mới nhất) |
| `POST` | `/api/trips/optimize` | `ADMIN` | Tối ưu và tạo chuyến mới bằng Google OR-Tools (chi tiết bên dưới) |
| `PATCH` | `/api/trips/:id/start` | `ADMIN`, `DRIVER` | Chuyển chuyến `ASSIGNED` ➔ `IN_TRANSIT` và đảm bảo tài xế ở trạng thái `ON_DELIVERY` |
| `PATCH` | `/api/trips/:id/driver` | `ADMIN` | Đổi tài xế `{ "driverId": 4 }` cho chuyến chưa hoàn thành (bắt buộc cùng depot), tự cập nhật trạng thái tài xế mới/cũ |
| `POST` | `/api/trips/:id/reoptimize` | `ADMIN` | Gọi lại Google OR-Tools cho các đơn `DELIVERING` còn lại, cập nhật `deliverySequence` & `totalDistance` |
| `DELETE` | `/api/trips/:id` | `ADMIN` | Hủy chuyến chưa hoàn thành — đưa đơn `DELIVERING` về `PACKED`, xóa chuyến (hoặc đóng `COMPLETED` nếu đã có đơn xong/thất bại) và giải phóng tài xế |

**Luồng xử lý `POST /api/trips/optimize`:**
- **Input:** `{ "storeId"?: 1, "orderIds": [1, 2, 3], "driverId"?: 3 }` (`storeId` mặc định là kho `isDefault`; `driverId` bỏ trống sẽ tự chọn tài xế `AVAILABLE` thuộc đúng depot).
- **Các bước:**
  1. Kiểm tra depot đang hoạt động, toàn bộ đơn `PACKED` và tài xế đều thuộc đúng `storeId`.
  2. Kiểm tra bán kính Haversine **≤ 5 km** cho từng đơn (trả `400` kèm danh sách đơn vi phạm nếu vượt).
  3. Gọi `POST http://python-solver:8090/solve-vrp` lấy thứ tự `sequence` và `total_distance_meters`.
  4. Tạo `Trip` (`ASSIGNED`), chuyển tài xế sang `ON_DELIVERY`, gán `tripId` / `deliverySequence` và chuyển các đơn sang `DELIVERING`.

---

## 3. Micro-service Python Google OR-Tools VRP Solver

Base URL local: `http://localhost:8090`

- **Công nghệ:** Python, FastAPI, Uvicorn, `ortools.constraint_solver.pywrapcp`.
- **Chiến lược giải:** `FirstSolutionStrategy.PATH_CHEAPEST_ARC` kết hợp `LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH`.
- **Endpoints:**
  - `GET /`: Health check.
  - `POST /solve-vrp`: Tính toán thứ tự điểm dừng tối ưu và tổng quãng đường.

### Request Payload Mẫu

```json
{
  "depot": { "lat": 10.7423, "lng": 106.7024 },
  "orders": [
    { "order_id": 1, "lat": 10.7480, "lng": 106.6980 },
    { "order_id": 2, "lat": 10.7450, "lng": 106.7050 },
    { "order_id": 3, "lat": 10.7380, "lng": 106.7110 }
  ],
  "num_vehicles": 1
}
```

### Response Payload Mẫu

```json
{
  "status": "SUCCESS",
  "routes": [
    {
      "vehicle_id": 0,
      "stops": [
        { "order_id": 3, "sequence": 1, "lat": 10.738, "lng": 106.711, "distance_from_prev_meters": 1067 },
        { "order_id": 2, "sequence": 2, "lat": 10.745, "lng": 106.705, "distance_from_prev_meters": 1023 },
        { "order_id": 1, "sequence": 3, "lat": 10.748, "lng": 106.698, "distance_from_prev_meters": 845 }
      ],
      "total_distance_meters": 3734
    }
  ]
}
```
