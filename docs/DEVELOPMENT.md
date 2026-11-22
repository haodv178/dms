# Hướng Dẫn Cài Đặt, Phát Triển, Kiểm Chứng & Demo

> Quay lại: [README.md](../README.md) | Xem thêm: [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) · [DEPLOY_AZURE.md](../infra/DEPLOY_AZURE.md)

---

## Mục Lục

1. [Khởi Chạy Toàn Bộ Hệ Thống (Docker Compose)](#1-khởi-chạy-toàn-bộ-hệ-thống-docker-compose)
2. [Nạp Dữ Liệu Mẫu Qua CLI](#2-nạp-dữ-liệu-mẫu-qua-cli)
3. [Phát Triển Frontend & Astryx CLI (Local)](#3-phát-triển-frontend--astryx-cli-local)
4. [Các Lệnh Tự Kiểm Chứng Bằng cURL](#4-các-lệnh-tự-kiểm-chứng-bằng-curl)
5. [Kịch Bản Kiểm Thử & Demo End-to-End](#5-kịch-bản-kiểm-thử--demo-end-to-end)
6. [Triển Khai Production (Azure)](#6-triển-khai-production-azure)

---

## 1. Khởi Chạy Toàn Bộ Hệ Thống (Docker Compose)

Toàn bộ 4 dịch vụ (`postgres`, `python-solver`, `backend`, `frontend`) đã được đóng gói Docker:

```bash
# Khởi động hệ thống
./start.sh
# Hoặc chạy trực tiếp:
docker compose up -d --build

# Kiểm tra trạng thái container
docker compose ps

# Dừng hệ thống
./stop.sh
# Hoặc chạy trực tiếp:
docker compose stop
```

Sau khi khởi động thành công:
- Frontend Dashboard: `http://localhost:5173`
- Backend REST API: `http://localhost:3000/api`
- Python VRP Solver: `http://localhost:8090`
- PostgreSQL: `localhost:5432`

---

## 2. Nạp Dữ Liệu Mẫu Qua CLI

### Sinh nhanh đơn hàng mẫu
Tọa độ GPS tự động sinh hợp lệ trong bán kính **5 km** quanh các kho đang hoạt động:

```bash
# Sinh 20 đơn hàng mẫu (mặc định)
npm --prefix backend run seed:orders

# Sinh số lượng đơn hàng tùy chọn (VD: 50 đơn)
npm --prefix backend run seed:orders -- 50
# hoặc
npm --prefix backend run seed:orders -- --count 50
```

### Sinh nhanh 1.000 sản phẩm mẫu (kiểm thử phân trang)

```bash
npm --prefix backend run db:push
npm --prefix backend run seed:products1000
```

---

## 3. Phát Triển Frontend & Astryx CLI (Local)

Yêu cầu **Node.js `>= 22.13.0`** khi chạy frontend ở chế độ local:

```bash
cd frontend
npm install

# Khởi chạy Vite dev server (http://localhost:5173)
npm run dev

# Kiểm tra TypeScript & build production
npm run build

# Kiểm tra cấu hình Astryx Design System
npm run astryx -- doctor

# Tra cứu tài liệu component của Astryx (VD: Button, Dialog, Table)
npm run astryx -- component Button
```

> Tài liệu hướng dẫn sử dụng Astryx dành cho AI coding agents nằm tại [`frontend/AGENTS.md`](../frontend/AGENTS.md).

---

## 4. Các Lệnh Tự Kiểm Chứng Bằng cURL

```bash
# 0. Đăng nhập ADMIN để lấy Access Token & Refresh Cookie
TOKEN=$(curl -s -c /tmp/dms_cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dms.vn","password":"123456"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).accessToken)")

# 1. Kiểm tra sức khỏe Backend & Python Solver
curl http://localhost:3000/api/health
curl http://localhost:8090/

# 2. Nạp dữ liệu mẫu (ADMIN)
curl -X POST http://localhost:3000/api/seed \
  -H "Authorization: Bearer $TOKEN"

# 3. Chuyển đơn số 1 sang PICKING rồi PACKED (ADMIN hoặc WAREHOUSE)
curl -X PATCH http://localhost:3000/api/orders/1/start-picking -H "Authorization: Bearer $TOKEN"
curl -X PATCH http://localhost:3000/api/orders/1/complete-packing -H "Authorization: Bearer $TOKEN"

# 4. Gọi tối ưu hóa lộ trình với Google OR-Tools (ADMIN)
curl -X POST http://localhost:3000/api/trips/optimize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"storeId": 1, "orderIds": [1]}'

# 5. Xác nhận giao hàng thành công (ADMIN hoặc DRIVER sở hữu chuyến)
curl -X PATCH http://localhost:3000/api/orders/1/complete-delivery \
  -H "Authorization: Bearer $TOKEN"

# 6. Truy vấn sản phẩm & tài xế có phân trang
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/products?page=1&limit=20&search=G%E1%BA%A1o"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/drivers?page=1&limit=20&status=AVAILABLE"

# 7. Gán / bỏ gán tài xế trực tiếp cho đơn hàng (ADMIN)
curl -X PATCH http://localhost:3000/api/orders/1/assign-driver \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"driverId": 3}'

curl -X PATCH http://localhost:3000/api/orders/1/assign-driver \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"driverId": null}'

# 8. Vòng đời chuyến xe (bắt đầu giao, đổi tài xế, tối ưu lại, hủy chuyến)
curl -X PATCH http://localhost:3000/api/trips/1/start -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:3000/api/trips/1/driver \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"driverId": 4}'

curl -X POST http://localhost:3000/api/trips/1/reoptimize -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:3000/api/trips/1 -H "Authorization: Bearer $TOKEN"

# 9. Thao tác hàng loạt trên đơn hàng
curl -X POST http://localhost:3000/api/orders/bulk-action \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "START_PICKING", "orderIds": [1, 2, 3]}'

curl -X POST http://localhost:3000/api/orders/bulk-action \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "ASSIGN_DRIVER", "orderIds": [1, 2], "driverId": 3}'

# 10. Quản lý Điểm xuất phát (Multi-Depot) & đặt kho mặc định
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/stores?page=1&limit=20"

curl -X POST http://localhost:3000/api/stores \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Kho Quận 1","address":"123 Lê Lợi, Quận 1, TP.HCM","latitude":10.7725,"longitude":106.6980,"phone":"02838221100"}'

curl -X PATCH http://localhost:3000/api/stores/2/set-default -H "Authorization: Bearer $TOKEN"

# 11. Xem & cập nhật tồn kho sản phẩm theo từng Depot
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/products?page=1&limit=20&storeId=1"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/stores/1/inventory?page=1&limit=15&stockFilter=LOW_STOCK"

curl -X PUT http://localhost:3000/api/stores/1/inventory \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"productId": 1, "quantity": 120}]}'
```

---

## 5. Kịch Bản Kiểm Thử & Demo End-to-End

Thực hiện tuần tự 4 bước sau trên giao diện **`http://localhost:5173`**:

1. **Bước 1 — Khởi tạo dữ liệu (`ADMIN` — `admin@dms.vn` / `123456`):**
   - Đăng nhập bằng tài khoản `ADMIN`. Trang chủ (`#orders`) hiển thị danh sách đơn hàng sắp xếp mặc định theo **ngày tạo mới nhất (`createdAt DESC`)**.
   - Bấm **"Tạo đơn mới"** trên góc phải (chọn depot, chọn tọa độ trong vòng tròn 5 km, thêm sản phẩm từ tồn kho depot) hoặc chạy lệnh `npm --prefix backend run seed:orders` ➔ đơn hàng mới xuất hiện ở trạng thái `NEW`.

2. **Bước 2 — Nghiệp vụ Kho (`WAREHOUSE` — `kho@dms.vn` / `123456`):**
   - Đăng xuất và đăng nhập bằng tài khoản `WAREHOUSE` (hoặc thực hiện trực tiếp bằng `ADMIN`).
   - Tại `#orders`, bấm **"Bắt đầu nhặt hàng"** trên một vài đơn ➔ trạng thái chuyển sang `PICKING`.
   - Bấm **"Đóng gói xong"** (hoặc chọn nhiều đơn để thao tác hàng loạt) ➔ trạng thái chuyển sang `PACKED`.

3. **Bước 3 — Tối ưu & Tạo chuyến xe với Google OR-Tools VRP (`ADMIN` — `admin@dms.vn` / `123456`):**
   - Đăng nhập bằng `ADMIN` và chuyển sang tab **"Chuyến xe"** (`#trips`).
   - Bấm **"Tạo chuyến mới"**, chọn điểm xuất phát, tài xế cùng depot (VD: `taixe@dms.vn`), chọn các đơn `PACKED` hợp lệ (≤ 5 km) và bấm **"Tối ưu & Tạo chuyến"**.
   - Backend gửi tọa độ Kho và các đơn sang `python-solver` chạy **Google OR-Tools** để tìm hành trình ngắn nhất.
   - Quan sát trên bản đồ Leaflet bên phải: Các điểm dừng được đánh số **`#1, #2, #3...`**, nối đường **Polyline** và hiển thị tổng quãng đường tối ưu. Có thể thử thêm **Đổi tài xế**, **Tối ưu lại (OR-Tools)** hoặc **Hủy chuyến**.

4. **Bước 4 — Giao hàng Chặng cuối (`DRIVER` — `taixe@dms.vn` / `123456`):**
   - Đăng xuất và đăng nhập bằng tài khoản `DRIVER` đã được gán ở Bước 3 (chỉ nhìn thấy chuyến và đơn của riêng mình).
   - Tại tab **"Chuyến xe"**, bấm **"Bắt đầu giao"** để chuyển chuyến từ `ASSIGNED` sang `IN_TRANSIT`.
   - Bấm **"Giao xong"** (hoặc **"Giao thất bại"**) cho từng điểm dừng theo đúng thứ tự `#1, #2, #3...` ➔ trạng thái đơn cập nhật ngay trên bảng & bản đồ; chuyến xe tự động chuyển `COMPLETED` và tài xế trở về `AVAILABLE` khi xử lý xong điểm dừng cuối cùng.

---

## 6. Triển Khai Production (Azure)

Hướng dẫn đầy đủ về hạ tầng Bicep, OIDC Federated Credentials, GitHub Actions CI/CD và xử lý sự cố được duy trì riêng tại:

- **[`infra/DEPLOY_AZURE.md`](../infra/DEPLOY_AZURE.md)**
