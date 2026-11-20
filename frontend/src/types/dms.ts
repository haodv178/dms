export type Role = 'ADMIN' | 'WAREHOUSE' | 'DRIVER';
export type OrderStatus =
  | 'NEW'
  | 'PICKING'
  | 'PACKED'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'FAILED';

export type ThemeMode = 'light' | 'dark' | 'system';

export type StatusBadgeVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow';

export interface OrderItem {
  id: number;
  productName: string;
  quantity: number;
  price: string | number;
}

export interface Store {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface Trip {
  id: number;
  tripCode: string;
  storeId: number;
  driverId: number | null;
  driver?: User | null;
  store?: Store;
  status: string;
  totalDistance: number | null;
  orders?: Order[];
  createdAt: string;
}

export interface Order {
  id: number;
  orderCode: string;
  storeId: number;
  store?: Store;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  latitude: number;
  longitude: number;
  totalAmount: string | number;
  status: OrderStatus;
  items: OrderItem[];
  tripId: number | null;
  trip?: Trip | null;
  deliverySequence: number | null;
  createdAt: string;
}

export interface NewOrderFormState {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  latitude: string;
  longitude: string;
  totalAmount: string;
  productName: string;
}

export const INITIAL_NEW_ORDER_FORM: NewOrderFormState = {
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  latitude: '10.7465',
  longitude: '106.7075',
  totalAmount: '350000',
  productName: 'Combo Thực phẩm Tươi sống Lotte Mart',
};

export const DEFAULT_DEPOT: Store = {
  id: 1,
  name: 'Lotte Mart Quận 7 (Depot)',
  address: '469 Nguyễn Hữu Thọ, Tân Hưng, Quận 7, TP.HCM',
  latitude: 10.7423,
  longitude: 106.7024,
};

export const ROLE_META: Record<
  Role,
  { label: string; shortLabel: string; email: string; badgeVariant: StatusBadgeVariant; desc: string }
> = {
  ADMIN: {
    label: 'Quản lý / Điều phối (ADMIN)',
    shortLabel: 'ADMIN',
    email: 'admin@dms.vn',
    badgeVariant: 'purple',
    desc: 'Chọn các đơn đã đóng gói (PACKED) và bấm tối ưu lộ trình với Google OR-Tools',
  },
  WAREHOUSE: {
    label: 'Nhân viên Kho (WAREHOUSE)',
    shortLabel: 'WAREHOUSE',
    email: 'kho@dms.vn',
    badgeVariant: 'orange',
    desc: 'Tiếp nhận đơn mới (NEW), thực hiện Nhặt hàng (PICKING) và Đóng gói (PACKED)',
  },
  DRIVER: {
    label: 'Tài xế Giao hàng (DRIVER)',
    shortLabel: 'DRIVER',
    email: 'taixe@dms.vn',
    badgeVariant: 'green',
    desc: 'Di chuyển theo thứ tự điểm dừng tối ưu (#1, #2, #3...) và xác nhận giao hàng',
  },
};

export const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; shortLabel: string; badgeVariant: StatusBadgeVariant; dotColor: string }
> = {
  NEW: {
    label: 'Mới tạo (NEW)',
    shortLabel: 'NEW',
    badgeVariant: 'cyan',
    dotColor: '#0284c7',
  },
  PICKING: {
    label: 'Đang nhặt (PICKING)',
    shortLabel: 'PICKING',
    badgeVariant: 'orange',
    dotColor: '#d97706',
  },
  PACKED: {
    label: 'Đã đóng gói (PACKED)',
    shortLabel: 'PACKED',
    badgeVariant: 'purple',
    dotColor: '#4f46e5',
  },
  DELIVERING: {
    label: 'Đang giao (DELIVERING)',
    shortLabel: 'DELIVERING',
    badgeVariant: 'blue',
    dotColor: '#2563eb',
  },
  COMPLETED: {
    label: 'Hoàn thành (COMPLETED)',
    shortLabel: 'COMPLETED',
    badgeVariant: 'green',
    dotColor: '#059669',
  },
  FAILED: {
    label: 'Giao thất bại (FAILED)',
    shortLabel: 'FAILED',
    badgeVariant: 'error',
    dotColor: '#e11d48',
  },
};

export const STATUS_TABS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'NEW', label: 'Mới (New)' },
  { key: 'PICKING', label: 'Đang nhặt (Picking)' },
  { key: 'PACKED', label: 'Đã đóng gói (Packed)' },
  { key: 'DELIVERING', label: 'Đang giao (Delivering)' },
  { key: 'COMPLETED', label: 'Hoàn thành (Completed)' },
] as const;

export function formatVND(val: string | number): string {
  return Number(val).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}
