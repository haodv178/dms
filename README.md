# Delivery Management System (DMS)

---

## Mục Lục

1. [Tổng Quan & Mục Tiêu Dự Án](#1-tổng-quan--mục-tiêu-dự-án)
2. [Kiến Trúc Dự Án](#2-so-sánh-kiến-trúc-enterprise-vs-đồ-án-thu-gọn)
3. [Kiến Trúc Tổng Thể & Cấu Trúc Thư Mục](#3-kiến-trúc-tổng-thể--cấu-trúc-thư-mục)
4. [Vòng Đời Đơn Hàng (Order Lifecycle State Machine)](#4-vòng-đời-đơn-hàng-order-lifecycle-state-machine)
5. [Thiết Kế Cơ Sở Dữ Liệu (PostgreSQL & Prisma Schema)](#5-thiết-kế-cơ-sở-dữ-liệu-postgresql--prisma-schema)
6. [Đặc Tả REST API & Micro-service Google OR-Tools](#6-đặc-tả-rest-api--micro-service-google-or-tools)
7. [Đặc Tả Giao Diện Web Admin Dashboard](#7-đặc-tả-giao-diện-web-admin-dashboard)
8. [Hướng Dẫn Cài Đặt, Khởi Chạy & Kiểm Chứng](#8-hướng-dẫn-cài-đặt-khởi-chạy--kiểm-chứng-docker--local)
9. [Kịch Bản Kiểm Thử](#9-kịch-bản-kiểm-thử--trình-chiếu-báo-cáo-đồ-án-end-to-end-demo)

---

## 1. Tổng Quan & Mục Tiêu Dự Án

Dự án này là phiên bản đồ án của **Hệ thống Quản lý Giao hàng (Delivery Management System - DMS)** phục vụ mô hình bán lẻ đa kênh (Omnichannel Retail Fulfillment).

Mục tiêu chính là **trình diễn trọn vẹn luồng nghiệp vụ xử lý đơn hàng tại kho và giao hàng chặng cuối** một cách trực quan, minh bạch nhất:
- Loại bỏ các thành phần hạ tầng doanh nghiệp phức tạp không cần thiết cho demo học thuật (RabbitMQ, tích hợp webhook 3PL Grab/Ahamove, đối soát két tiền mặt nhiều cấp).
- **Giữ nguyên và làm nổi bật thuật toán cốt lõi:** Tự động gom chuyến và tối ưu hóa thứ tự điểm giao hàng bằng **Google OR-Tools (Vehicle Routing Problem - VRP)** kèm trực quan hóa lộ trình trên bản đồ số **Leaflet OpenStreetMap**.

---

## 2. Kiến Trúc Dự Án

```text
- 1 Monolithic Backend:
  * Node.js (TypeScript) + Express
  * Prisma ORM + PostgreSQL
  * JWT Auth + Switch-Role Menu
- 1 Micro-service Helper:
  * Python FastAPI + Google OR-Tools (VRP Solver)
- Frontend:
  * React (Vite) + TailwindCSS + Leaflet Map
```

---

## 3. Kiến Trúc Tổng Thể & Cấu Trúc Thư Mục

### 3.1. Sơ Đồ Kiến Trúc

```text
                       ┌──────────────────────────────────────────────┐
                       │           Web Admin Dashboard (SPA)          │
                       │   (React + Vite + TailwindCSS + Leaflet)     │
                       │             http://localhost:5173            │
                       └──────────────────────┬───────────────────────┘
                                              │ HTTP REST (/api/*)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │          Node.js Monolith Backend            │
                       │         (Express + TypeScript + Prisma)      │
                       │             http://localhost:3000            │
                       │                                              │
                       │  - Auth & Role Switching (Admin/Kho/Tài xế)  │
                       │  - Order Lifecycle Management.               │
                       │  - Dispatcher & Trip Builder                 │
                       └──────────────┬────────────────┬──────────────┘
                                      │                │
            Prisma Client (SQL queries)                │ HTTP POST /solve-vrp
                                      ▼                ▼
                       ┌────────────────────┐   ┌─────────────────────┐
                       │     PostgreSQL     │   │  Python VRP Solver  │
                       │  (Single Database) │   │  (Google OR-Tools)  │
                       │   localhost:5432   │   │   localhost:8090    │
                       └────────────────────┘   └─────────────────────┘
```

### 3.2. Cấu Trúc Thư Mục Dự Án

```text
doan/
├── docker-compose.yml           # Orchestration cho cả 4 containers (Postgres, Solver, Backend, Frontend)
├── start.sh                     # Script khởi động nhanh toàn bộ hệ thống bằng Docker Compose
├── stop.sh                      # Script dừng toàn bộ hệ thống
├── README.md                    # Tài liệu tổng hợp toàn dự án
├── backend/                     # Node.js Monolithic Backend (:3000)
│   ├── Dockerfile               # Docker image cho Backend
│   ├── docker-entrypoint.sh     # Tự động đồng bộ Prisma schema & khởi chạy server
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma        # Định nghĩa 5 bảng dữ liệu PostgreSQL
│   │   └── seed.ts              # Script nạp dữ liệu mẫu qua CLI
│   └── src/
│       ├── index.ts             # Entrypoint Express & tự động seed khi DB trống
│       ├── lib/
│       │   ├── prisma.ts        # Khởi tạo Prisma Client
│       │   └── seeder.ts        # Logic tạo 1 Kho (Depot), 3 Users và 10 Đơn hàng mẫu
│       ├── controllers/
│       │   ├── auth.controller.ts   # Login, Me, System Overview, Seed API
│       │   ├── order.controller.ts  # Quản lý đơn hàng & chuyển trạng thái Kho/Tài xế
│       │   └── trip.controller.ts   # Gọi Python OR-Tools Solver & tạo chuyến xe (Trip)
│       └── routes/
│           ├── auth.routes.ts
│           ├── order.routes.ts
│           └── trip.routes.ts
├── python-solver/               # Micro-service giải bài toán VRP với Google OR-Tools (:8090)
│   ├── Dockerfile               # Docker image cho Python Solver
│   ├── requirements.txt         # Các thư viện Python (fastapi, uvicorn, ortools, pydantic)
│   └── main.py                  # FastAPI endpoint POST /solve-vrp
└── frontend/                    # Giao diện Web Admin Dashboard (:5173)
    ├── Dockerfile               # Multi-stage build (Node Vite Builder -> Nginx Alpine)
    ├── nginx.conf               # Cấu hình Nginx phục vụ SPA & reverse-proxy /api/
    ├── index.html               # Tích hợp Leaflet CSS
    ├── package.json
    ├── tailwind.config.js
    └── src/
        ├── App.tsx              # Giao diện chính: Top Bar Role Switcher, Bản đồ Leaflet
        ├── main.tsx
        └── index.css
```

---

## 4. Vòng Đời Đơn Hàng (Order Lifecycle State Machine)

Hệ thống gom gọn quy trình vận hành thành **4 giai đoạn chính (6 mã trạng thái)**:

```mermaid
stateDiagram-v2
    [*] --> NEW: Đơn hàng mới (Form Web / Seed)
    NEW --> PICKING: Nhân viên kho bấm "Bắt đầu nhặt hàng"
    PICKING --> PACKED: Nhân viên kho bấm "Đóng gói xong"
    PACKED --> DELIVERING: Điều phối bấm "Tối ưu OR-Tools & Gán xe"
    DELIVERING --> COMPLETED: Tài xế bấm "Giao thành công"
    DELIVERING --> FAILED: Tài xế bấm "Giao thất bại"
    COMPLETED --> [*]
    FAILED --> [*]
```

### Bảng Định Nghĩa Trạng Thái

| Mã Trạng Thái | Tên Trạng Thái | Vai Trò Thực Hiện | Hành Động Kích Hoạt |
| :--- | :--- | :--- | :--- |
| **`NEW`** | Mới tạo | Khách / Admin | Tạo đơn qua form hoặc bấm nút `"Seed 10 Sample Orders"` |
| **`PICKING`** | Đang nhặt hàng | Nhân viên Kho (`WAREHOUSE`) | Nhân viên kho nhận đơn và đi lấy hàng trong kho/siêu thị |
| **`PACKED`** | Đã đóng gói | Nhân viên Kho (`WAREHOUSE`) | Kiểm tra hàng, đóng vào túi/thùng, sẵn sàng chờ điều phối giao |
| **`DELIVERING`**| Đang giao hàng | Điều phối viên (`ADMIN`) | Chọn các đơn `PACKED`, chạy Google OR-Tools và gán chuyến cho tài xế |
| **`COMPLETED`** | Giao thành công | Tài xế (`DRIVER`) | Tài xế đến địa chỉ khách hàng theo thứ tự điểm dừng và xác nhận hoàn tất |
| **`FAILED`** | Giao thất bại | Tài xế (`DRIVER`) | Khách không nhận hàng hoặc không liên lạc được |

---

## 5. Thiết Kế Cơ Sở Dữ Liệu (PostgreSQL & Prisma Schema)

Định nghĩa tại `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  WAREHOUSE
  DRIVER
}

enum OrderStatus {
  NEW
  PICKING
  PACKED
  DELIVERING
  COMPLETED
  FAILED
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(WAREHOUSE)
  trips     Trip[]
  createdAt DateTime @default(now())
}

model Store {
  id        Int      @id @default(autoincrement())
  name      String
  address   String
  latitude  Float    // Điểm xuất phát (Depot) cho thuật toán VRP
  longitude Float
  orders    Order[]
  trips     Trip[]
}

model Order {
  id               Int         @id @default(autoincrement())
  orderCode        String      @unique
  storeId          Int
  store            Store       @relation(fields: [storeId], references: [id])
  customerName     String
  customerPhone    String
  customerAddress  String
  latitude         Float       // Tọa độ GPS khách hàng
  longitude        Float
  totalAmount      Decimal     @db.Decimal(10, 2)
  status           OrderStatus @default(NEW)
  items            OrderItem[]
  tripId           Int?
  trip             Trip?       @relation(fields: [tripId], references: [id])
  deliverySequence Int?        // Thứ tự dừng xe do OR-Tools tối ưu (1, 2, 3...)
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
}

model OrderItem {
  id          Int     @id @default(autoincrement())
  orderId     Int
  order       Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productName String
  quantity    Int
  price       Decimal @db.Decimal(10, 2)
}

model Trip {
  id            Int      @id @default(autoincrement())
  tripCode      String   @unique
  storeId       Int
  store         Store    @relation(fields: [storeId], references: [id])
  driverId      Int?
  driver        User?    @relation(fields: [driverId], references: [id])
  orders        Order[]
  status        String   @default("ASSIGNED") // ASSIGNED | IN_TRANSIT | COMPLETED
  totalDistance Float?   // Tổng quãng đường tối ưu (mét)
  createdAt     DateTime @default(now())
}
```

---

## 6. Đặc Tả REST API & Micro-service Google OR-Tools

### 6.1. Backend Node.js REST API (`http://localhost:3000/api`)

#### Xác thực & Hệ thống
- `GET /api/health`: Kiểm tra trạng thái hoạt động của Backend.
- `POST /api/auth/login`: Đăng nhập (`{ email, password }`), trả về JWT token và thông tin tài khoản.
- `GET /api/auth/me`: Lấy thông tin tài khoản hiện tại.
- `GET /api/system/overview`: Lấy danh sách Kho (`stores`) và Người dùng (`users`).
- `POST /api/seed`: Reset và nạp lại dữ liệu mẫu gồm:
  - **1 Kho xuất phát (Depot):** `Lotte Mart Quận 7 (Depot)` (`10.7423, 106.7024`)
  - **3 Tài khoản mẫu:**
    - `admin@dms.vn` (Mật khẩu: `123`, Role: `ADMIN`)
    - `kho@dms.vn` (Mật khẩu: `123`, Role: `WAREHOUSE`)
    - `taixe@dms.vn` (Mật khẩu: `123`, Role: `DRIVER`)
  - **10 Đơn hàng mẫu (`ORD-101` ➔ `ORD-110`)** có tọa độ GPS thực tế quanh khu vực Quận 7, Quận 4, Nhà Bè.

#### Quản lý Đơn hàng
- `GET /api/orders`: Danh sách đơn hàng (hỗ trợ lọc `?status=NEW|PICKING|PACKED|DELIVERING|COMPLETED|FAILED`).
- `GET /api/orders/:id`: Xem chi tiết đơn hàng và danh sách sản phẩm (`items`).
- `POST /api/orders`: Tạo đơn hàng mới thủ công.
- `PATCH /api/orders/:id/start-picking`: Chuyển trạng thái đơn từ `NEW` ➔ `PICKING`.
- `PATCH /api/orders/:id/complete-packing`: Chuyển trạng thái đơn từ `PICKING` ➔ `PACKED`.

#### Điều phối & Tối ưu Lộ trình (OR-Tools Integration)
- `POST /api/trips/optimize`:
  - **Input:** `{ "storeId": 1, "orderIds": [1, 2, 3], "driverId": 3 }`
  - **Luồng xử lý:**
    1. Truy vấn tọa độ Depot (`Store`) và tọa độ các đơn hàng `PACKED` được chọn.
    2. Gọi `POST http://python-solver:8090/solve-vrp`.
    3. Nhận danh sách điểm dừng đã sắp xếp tối ưu (`sequence: 1, 2, 3...`) và tổng quãng đường (`total_distance_meters`).
    4. Khởi tạo bản ghi `Trip`, cập nhật `tripId`, `deliverySequence` và chuyển trạng thái các đơn hàng sang `DELIVERING`.
- `GET /api/trips`: Danh sách các chuyến xe.
- `GET /api/trips/my-active`: Lấy chuyến xe đang thực hiện (hoặc chuyến mới nhất) để hiển thị lộ trình trên bản đồ.

#### Thực thi Giao hàng (Driver Execution)
- `PATCH /api/orders/:id/complete-delivery`: Chuyển trạng thái đơn sang `COMPLETED` (tự động hoàn tất `Trip` khi toàn bộ đơn trong chuyến đã giao xong).
- `PATCH /api/orders/:id/fail-delivery`: Chuyển trạng thái đơn sang `FAILED`.

---

### 6.2. Micro-service Python Google OR-Tools VRP Solver (`http://localhost:8090`)

- **Công nghệ:** Python, FastAPI, Uvicorn, `ortools.constraint_solver.pywrapcp`.
- **Chiến lược giải:** `FirstSolutionStrategy.PATH_CHEAPEST_ARC` kết hợp `LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH`.
- **Endpoint:** `POST /solve-vrp`

#### Request Payload Mẫu:
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

#### Response Payload Mẫu:
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

---

## 7. Đặc Tả Giao Diện Web Admin Dashboard

Giao diện đơn trang (SPA) tại `http://localhost:5173` được chia làm 3 khu vực trực quan:

1. **Thanh Công Cụ Trên Cùng (Top Bar):**
   - **Role Switcher:** Chuyển đổi tức thì giữa 3 vai trò (`Quản lý / Điều phối - ADMIN`, `Nhân viên Kho - WAREHOUSE`, `Tài xế Giao hàng - DRIVER`) mà không cần đăng xuất/đăng nhập lại.
   - **Tạo đơn mới:** Mở hộp thoại thêm đơn hàng mới kèm tọa độ GPS.
   - **Seed 10 Sample Orders:** Khôi phục/nạp nhanh 10 đơn hàng mẫu ở trạng thái `NEW` để bắt đầu buổi thuyết trình.
2. **Bảng Điều Phối & Quản Lý Vòng Đời Đơn Hàng (Bên trái):**
   - Các tab lọc đơn hàng theo trạng thái kèm số lượng thực tế.
   - Nút tiện ích **"Đóng gói nhanh"** giúp chuyển nhanh các đơn `NEW`/`PICKING` sang `PACKED` khi muốn demo ngay thuật toán OR-Tools.
   - Nút điểm nhấn **"⚡ Tối ưu hóa lộ trình với Google OR-Tools"** khi chọn các đơn `PACKED`.
   - Các nút thao tác trực tiếp trên từng dòng đơn hàng (`Bắt đầu nhặt hàng`, `Đóng gói xong`, `Giao thành công`, `Giao thất bại`).
3. **Bản Đồ Lộ Trình Leaflet & Chi Tiết Chuyến Xe (Bên phải):**
   - Hiển thị Marker **Kho xuất phát (Depot)** màu đỏ (`🏪`).
   - Hiển thị các điểm giao hàng bằng Marker tròn đánh số thứ tự dừng xe **`1, 2, 3...`** theo kết quả của Google OR-Tools.
   - Vẽ đường nối **Polyline** từ `Depot ➔ Stop #1 ➔ Stop #2 ➔ Stop #3...`.
   - Thẻ thông tin chuyến xe bên dưới bản đồ hiển thị mã chuyến (`TRIP-...`), tên tài xế, tổng quãng đường (`km`/`m`) và danh sách các điểm dừng theo thứ tự.

---

## 8. Hướng Dẫn Cài Đặt, Khởi Chạy & Kiểm Chứng

### 8.1. Khởi Chạy Toàn Bộ Hệ Thống

Toàn bộ 4 dịch vụ (`postgres`, `python-solver`, `backend`, `frontend`) đã được đóng gói Docker.

#### Khởi động hệ thống:
```bash
./start.sh
# Hoặc chạy trực tiếp:
docker compose up -d --build
```

#### Kiểm tra trạng thái các container:
```bash
docker compose ps
```

#### Tắt hệ thống:
```bash
./stop.sh
# Hoặc chạy trực tiếp:
docker compose stop
```

---

### 8.2. Các Lệnh Tự Kiểm Chứng (Self-Verification bằng cURL)

```bash
# 1. Kiểm tra sức khỏe Backend & Python Solver
curl http://localhost:3000/api/health
curl http://localhost:8090/

# 2. Nạp 10 đơn hàng mẫu
curl -X POST http://localhost:3000/api/seed

# 3. Chuyển đơn số 1 sang PICKING rồi PACKED
curl -X PATCH http://localhost:3000/api/orders/1/start-picking
curl -X PATCH http://localhost:3000/api/orders/1/complete-packing

# 4. Gọi tối ưu hóa lộ trình với Google OR-Tools
curl -X POST http://localhost:3000/api/trips/optimize \
  -H "Content-Type: application/json" \
  -d '{"storeId": 1, "orderIds": [1]}'

# 5. Tài xế xác nhận giao hàng thành công
curl -X PATCH http://localhost:3000/api/orders/1/complete-delivery
```

---

## 9. Kịch Bản Kiểm Thử

Thực hiện tuần tự 4 bước sau trên giao diện **`http://localhost:5173`**:

1. **Bước 1 — Khởi tạo dữ liệu:**
   - Mở Dashboard: Kho trung tâm (**Lotte Mart Quận 7 - Depot**) xử lý đơn hàng và giao chặng cuối (Last-mile delivery).
   - Bấm nút **"Seed 10 Sample Orders"** trên góc phải ➔ 10 đơn hàng xuất hiện ở trạng thái `NEW` và hiển thị vị trí quanh kho trên bản đồ.

2. **Bước 2 — Nghiệp vụ Kho (Warehouse Fulfillment):**
   - Chọn vai trò **"📦 Nhân viên Kho (WAREHOUSE)"** trên thanh công cụ.
   - Bấm **"Bắt đầu nhặt hàng"** trên một vài đơn ➔ Trạng thái chuyển sang `PICKING`.
   - Bấm **"Đóng gói xong"** (hoặc bấm nút **"Đóng gói nhanh"**) ➔ Trạng thái chuyển sang `PACKED`.

3. **Bước 3 — Điểm nhấn Thuật toán Google OR-Tools VRP:**
   - Chuyển vai trò sang **"👑 Quản lý / Điều phối (ADMIN)"**.
   - Tick chọn các đơn hàng `PACKED` và bấm nút **"⚡ Tối ưu hóa lộ trình với Google OR-Tools"**.
   - Giải thích: Backend gửi tọa độ Kho và các đơn hàng sang micro-service Python FastAPI chạy thuật toán **Google OR-Tools** để tìm hành trình ngắn nhất.
   - Quan sát trên bản đồ Leaflet: Hệ thống tự động đánh số thứ tự giao hàng `#1, #2, #3...`, vẽ đường nối lộ trình Polyline và hiển thị tổng quãng đường di chuyển tối ưu.

4. **Bước 4 — Tài xế Giao hàng Chặng cuối (Driver Execution):**
   - Chuyển vai trò sang **"🛵 Tài xế Giao hàng (DRIVER)"**.
   - Xem danh sách điểm dừng đã được sắp xếp theo đúng thứ tự `Stop #1, Stop #2, Stop #3...`.
   - Bấm **"Giao thành công"** cho từng đơn theo thứ tự lộ trình ➔ Trạng thái đơn chuyển sang `COMPLETED` (màu xanh lá trên cả bảng và bản đồ) và chuyến xe tự động hoàn tất.
