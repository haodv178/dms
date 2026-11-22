# Delivery Management System (DMS)

Hệ thống **Quản lý Giao hàng (Delivery Management System - DMS)** phục vụ mô hình bán lẻ đa kênh (Omnichannel Retail Fulfillment), tập trung trình diễn trọn vẹn luồng nghiệp vụ xử lý đơn hàng tại kho và giao hàng chặng cuối (Last-Mile Delivery).

---

## 1. Tổng Quan & Mục Tiêu Nghiệp Vụ

DMS giải quyết bài toán vận hành giao hàng nội thành từ nhiều điểm xuất phát (Multi-Depot) đến tay khách hàng:

- **Trực quan hóa trọn vẹn vòng đời đơn hàng:** Từ lúc tiếp nhận đơn (`NEW`), nhặt hàng (`PICKING`), đóng gói (`PACKED`), điều phối gom chuyến (`DELIVERING`) đến khi hoàn tất (`COMPLETED`) hoặc giao thất bại (`FAILED`).
- **Tối ưu hóa lộ trình giao hàng (VRP):** Tự động gom nhiều đơn đã đóng gói thành chuyến xe và tính toán thứ tự giao hàng ngắn nhất bằng **Google OR-Tools**, hiển thị trực tiếp trên bản đồ số.
- **Phạm vi đồ án tinh gọn:** Loại bỏ các thành phần hạ tầng doanh nghiệp phức tạp không cần thiết cho demo học thuật (message broker, webhook 3PL bên thứ ba, đối soát két tiền mặt nhiều cấp) để tập trung làm nổi bật nghiệp vụ cốt lõi và thuật toán định tuyến.

---

## 2. Khởi Chạy Nhanh (Quick Start - Local)

Yêu cầu cài đặt **Docker** và **Docker Compose**:

```bash
./start.sh        # Khởi động toàn bộ 4 dịch vụ (PostgreSQL, Solver, Backend, Frontend)
./stop.sh         # Dừng hệ thống
```

- **Web Admin Dashboard:** `http://localhost:5173`
- **Backend API:** `http://localhost:3000` *(Health check: [`/api/health`](http://localhost:3000/api/health))*
- **Tài khoản đăng nhập Dashboard (`ADMIN`):** `admin@dms.vn` / `123456`

---

## 3. Môi Trường Production (Azure)

Hệ thống được triển khai trực tuyến trên **Microsoft Azure** (Azure Static Web Apps + Azure Container Apps + PostgreSQL Flexible Server):

- **Frontend (Web Dashboard):** https://jolly-pebble-01998db00.3.azurestaticapps.net
- **Backend API:** https://dms-backend.yellowriver-280db563.malaysiawest.azurecontainerapps.io *(Health check: [`/api/health`](https://dms-backend.yellowriver-280db563.malaysiawest.azurecontainerapps.io/api/health))*
- **Tài khoản đăng nhập Dashboard (`ADMIN`):** `admin@dms.vn` / `123456`

> **Lưu ý:** Backend và Python Solver được cấu hình tự động scale-to-zero khi không có lưu lượng truy cập, nên yêu cầu đầu tiên sau thời gian nghỉ có thể mất vài giây để khởi động lại (cold start).

---

## 4. Tài Liệu Kỹ Thuật

Các thông tin chi tiết về kiến trúc, cơ sở dữ liệu, API, hướng dẫn phát triển và triển khai được tách riêng thành các tài liệu chuyên biệt:

| Tài liệu | Nội dung chính |
| :--- | :--- |
| [**docs/USER_GUIDE.md**](docs/USER_GUIDE.md) | Hướng dẫn sử dụng chi tiết theo từng vai trò (`ADMIN`, `WAREHOUSE`, `DRIVER`), kịch bản vận hành mẫu, bảng tra cứu trạng thái & xử lý sự cố |
| [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md) | Tech stack, sơ đồ kiến trúc, cấu trúc thư mục, sơ đồ ER cơ sở dữ liệu & đặc tả giao diện Web Dashboard |
| [**docs/API.md**](docs/API.md) | Cơ chế xác thực JWT/Refresh Token, đặc tả toàn bộ REST API Backend & micro-service Google OR-Tools VRP |
| [**docs/DEVELOPMENT.md**](docs/DEVELOPMENT.md) | Hướng dẫn cài đặt Docker/Local, CLI nạp dữ liệu mẫu, bộ lệnh cURL tự kiểm chứng & kịch bản demo End-to-End |
| [**infra/DEPLOY_AZURE.md**](infra/DEPLOY_AZURE.md) | Kiến trúc Azure (Static Web Apps, Container Apps, PostgreSQL Flexible Server), Bicep IaC & CI/CD OIDC |
