export type Role = 'ADMIN' | 'WAREHOUSE' | 'DRIVER';
export type ActivePage = 'orders' | 'products' | 'drivers';
export type DriverStatus = 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE';
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
  productId?: number | null;
  sku?: string | null;
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

export interface OrderItemFormState {
  productId?: number | null;
  sku: string;
  productName: string;
  quantity: string;
  price: string;
}

export interface OrderFormState {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  latitude: string;
  longitude: string;
  items: OrderItemFormState[];
}

export const EDITABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'NEW',
  'PICKING',
  'PACKED',
] as const;

export function isOrderEditable(status: OrderStatus): boolean {
  return EDITABLE_ORDER_STATUSES.includes(status);
}

export function canRoleEditOrders(role: Role): boolean {
  return role === 'ADMIN' || role === 'WAREHOUSE';
}

export function canRoleManageDrivers(role: Role): boolean {
  return role === 'ADMIN';
}

export const INITIAL_ORDER_FORM: OrderFormState = {
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  latitude: '10.7465',
  longitude: '106.7075',
  items: [],
};

export function orderToFormState(order: Order, catalog: Product[] = []): OrderFormState {
  const byName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
  return {
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    latitude: String(order.latitude),
    longitude: String(order.longitude),
    items: (order.items ?? []).map((item) => {
      const matched = byName.get(item.productName.toLowerCase());
      return {
        productId: item.productId ?? matched?.id ?? null,
        sku: item.sku || matched?.sku || '—',
        productName: item.productName,
        quantity: String(item.quantity),
        price: String(Number(item.price)),
      };
    }),
  };
}

export function computeOrderFormTotal(items: OrderItemFormState[]): number {
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity);
    const price = Number(item.price);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) {
      return sum;
    }
    return sum + qty * price;
  }, 0);
}

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

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: string | number;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductSummary {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  totalStock: number;
}

export interface PaginatedProductsResponse {
  items: Product[];
  pagination: ProductPagination;
  summary: ProductSummary;
}

export interface ProductFormState {
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: string;
  stock: string;
  isActive: boolean;
}

export const PRODUCT_CATEGORIES = [
  'Thực phẩm tươi sống',
  'Rau củ & Trái cây',
  'Thực phẩm khô',
  'Sữa & Đồ uống',
  'Hóa mỹ phẩm',
  'Khác',
] as const;

export const INITIAL_PRODUCT_FORM: ProductFormState = {
  sku: '',
  name: '',
  category: 'Thực phẩm tươi sống',
  unit: 'Hộp',
  price: '50000',
  stock: '50',
  isActive: true,
};

export function productToFormState(product: Product): ProductFormState {
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit: product.unit,
    price: String(Number(product.price)),
    stock: String(product.stock),
    isActive: product.isActive,
  };
}

export interface DriverActiveTrip {
  id: number;
  tripCode: string;
  status: string;
  ordersCount: number;
}

export interface Driver {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone: string;
  vehicleType: string;
  licensePlate: string;
  status: DriverStatus;
  isActive: boolean;
  notes: string;
  activeTrip: DriverActiveTrip | null;
  totalTrips: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriverPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DriverSummary {
  totalDrivers: number;
  availableDrivers: number;
  onDeliveryDrivers: number;
  inactiveDrivers: number;
}

export interface PaginatedDriversResponse {
  items: Driver[];
  pagination: DriverPagination;
  summary: DriverSummary;
}

export interface DriverFormState {
  name: string;
  email: string;
  password: string;
  phone: string;
  vehicleType: string;
  licensePlate: string;
  status: DriverStatus;
  isActive: boolean;
  notes: string;
}

export const DRIVER_VEHICLE_TYPES = ['Xe máy', 'Xe tải nhỏ', 'Xe van'] as const;

export const DRIVER_STATUS_CONFIG: Record<
  DriverStatus,
  { label: string; shortLabel: string; badgeVariant: StatusBadgeVariant }
> = {
  AVAILABLE: {
    label: 'Sẵn sàng (AVAILABLE)',
    shortLabel: 'Sẵn sàng',
    badgeVariant: 'green',
  },
  ON_DELIVERY: {
    label: 'Đang giao hàng (ON_DELIVERY)',
    shortLabel: 'Đang giao',
    badgeVariant: 'blue',
  },
  OFFLINE: {
    label: 'Ngoại tuyến (OFFLINE)',
    shortLabel: 'Ngoại tuyến',
    badgeVariant: 'neutral',
  },
};

export const INITIAL_DRIVER_FORM: DriverFormState = {
  name: '',
  email: '',
  password: '',
  phone: '',
  vehicleType: 'Xe máy',
  licensePlate: '',
  status: 'AVAILABLE',
  isActive: true,
  notes: '',
};

export function driverToFormState(driver: Driver): DriverFormState {
  return {
    name: driver.name,
    email: driver.email,
    password: '',
    phone: driver.phone,
    vehicleType: driver.vehicleType || 'Xe máy',
    licensePlate: driver.licensePlate,
    status: driver.status,
    isActive: driver.isActive,
    notes: driver.notes || '',
  };
}

export function formatVND(val: string | number): string {
  return Number(val).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}
