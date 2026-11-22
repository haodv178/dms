export type Role = 'ADMIN' | 'WAREHOUSE' | 'DRIVER';
export type ActivePage = 'orders' | 'trips' | 'products' | 'drivers' | 'depots' | 'users';
export type DriverStatus = 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE';
export type TripStatus = 'ASSIGNED' | 'IN_TRANSIT' | 'COMPLETED';
export type OrderStatus =
  | 'NEW'
  | 'PICKING'
  | 'PACKED'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'FAILED';

export type PaymentMethod =
  | 'COD'
  | 'CREDIT_CARD'
  | 'MOMO'
  | 'BANK_TRANSFER'
  | 'ZALOPAY'
  | 'VNPAY';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

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
  code?: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  isDefault?: boolean;
  isActive?: boolean;
  notes?: string | null;
  ordersCount?: number;
  tripsCount?: number;
  driversCount?: number;
  totalStock?: number;
  inStockSkuCount?: number;
  lowStockSkuCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoreInventoryItem {
  productId: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: string | number;
  isActive: boolean;
  quantity: number;
  updatedAt: string;
}

export interface StoreInventorySummary {
  totalProducts: number;
  inStockSkuCount: number;
  outOfStockSkuCount: number;
  lowStockSkuCount: number;
  totalStock: number;
}

export interface PaginatedStoreInventoryResponse {
  store: {
    id: number;
    code: string;
    name: string;
    isDefault: boolean;
    isActive: boolean;
  };
  items: StoreInventoryItem[];
  pagination: ProductPagination;
  summary: StoreInventorySummary;
}

export interface StorePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface StoreSummary {
  totalStores: number;
  activeStores: number;
  inactiveStores: number;
  defaultStoreId: number | null;
  defaultStoreName: string;
  totalOrders: number;
  totalTrips: number;
}

export interface PaginatedStoresResponse {
  items: Store[];
  pagination: StorePagination;
  summary: StoreSummary;
}

export interface StoreFormState {
  code: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  phone: string;
  isDefault: boolean;
  isActive: boolean;
  notes: string;
}

export const INITIAL_STORE_FORM: StoreFormState = {
  code: '',
  name: '',
  address: '',
  latitude: '10.7423',
  longitude: '106.7024',
  phone: '',
  isDefault: false,
  isActive: true,
  notes: '',
};

export function storeToFormState(store: Store): StoreFormState {
  return {
    code: store.code || '',
    name: store.name,
    address: store.address,
    latitude: String(store.latitude),
    longitude: String(store.longitude),
    phone: store.phone || '',
    isDefault: Boolean(store.isDefault),
    isActive: store.isActive !== false,
    notes: store.notes || '',
  };
}

export const MAX_DELIVERY_DISTANCE_KM = 5;

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export interface UserDriverProfileSummary {
  storeId?: number;
  phone: string;
  vehicleType: string;
  licensePlate: string;
  status: DriverStatus;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  driverProfile?: UserDriverProfileSummary | null;
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
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAt?: string | null;
  paymentReference?: string | null;
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
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  latitude: string;
  longitude: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  items: OrderItemFormState[];
}

export const EDITABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'NEW',
  'PICKING',
  'PACKED',
] as const;

export const ASSIGNABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'PACKED',
  'DELIVERING',
  'FAILED',
] as const;

export function isOrderEditable(status: OrderStatus): boolean {
  return EDITABLE_ORDER_STATUSES.includes(status);
}

export function isOrderAssignable(status: OrderStatus): boolean {
  return ASSIGNABLE_ORDER_STATUSES.includes(status);
}

export type BulkOrderActionType =
  | 'START_PICKING'
  | 'COMPLETE_PACKING'
  | 'ASSIGN_DRIVER'
  | 'UNASSIGN_DRIVER'
  | 'COMPLETE_DELIVERY'
  | 'FAIL_DELIVERY';

export interface BulkSkippedOrder {
  id: number;
  orderCode: string | null;
  reason: string;
}

export interface BulkOrderActionResult {
  updatedCount: number;
  updatedOrders: Order[];
  skipped: BulkSkippedOrder[];
  message: string;
}

export function canRolePickAndPack(role: Role): boolean {
  return role === 'ADMIN' || role === 'WAREHOUSE';
}

export function canRoleEditOrders(role: Role): boolean {
  return role === 'ADMIN';
}

export function canRoleAssignDriver(role: Role): boolean {
  return role === 'ADMIN';
}

export function canRoleManageDrivers(role: Role): boolean {
  return role === 'ADMIN';
}

export function canRoleManageDepots(role: Role): boolean {
  return role === 'ADMIN';
}

export function canRoleEditDepotInventory(role: Role): boolean {
  return role === 'ADMIN' || role === 'WAREHOUSE';
}

export function canRoleCreateTrips(role: Role): boolean {
  return role === 'ADMIN';
}

export function canRoleManageTrips(role: Role): boolean {
  return role === 'ADMIN';
}

export function canRoleStartTrip(role: Role): boolean {
  return role === 'ADMIN' || role === 'DRIVER';
}

export function canRoleUpdateStopDelivery(role: Role): boolean {
  return role === 'ADMIN' || role === 'DRIVER';
}

export function canRoleManageUsers(role: Role): boolean {
  return role === 'ADMIN';
}

export function getAllowedPagesForRole(role: Role): ActivePage[] {
  if (role === 'ADMIN') {
    return ['orders', 'trips', 'products', 'drivers', 'depots', 'users'];
  }
  if (role === 'WAREHOUSE') {
    return ['orders', 'trips', 'products', 'depots'];
  }
  return ['orders', 'trips'];
}

export function canRoleAccessPage(role: Role, page: ActivePage): boolean {
  return getAllowedPagesForRole(role).includes(page);
}

export const INITIAL_ORDER_FORM: OrderFormState = {
  storeId: '',
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  latitude: '10.7465',
  longitude: '106.7075',
  paymentMethod: 'COD',
  paymentStatus: 'UNPAID',
  paymentReference: '',
  items: [],
};

export function orderToFormState(order: Order, catalog: Product[] = []): OrderFormState {
  const byName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
  return {
    storeId: String(order.storeId),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    latitude: String(order.latitude),
    longitude: String(order.longitude),
    paymentMethod: order.paymentMethod ?? 'COD',
    paymentStatus: order.paymentStatus ?? 'UNPAID',
    paymentReference: order.paymentReference ?? '',
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

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'COD',
  'CREDIT_CARD',
  'MOMO',
  'BANK_TRANSFER',
  'ZALOPAY',
  'VNPAY',
] as const;

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'UNPAID',
  'PAID',
  'REFUNDED',
] as const;

export const PAYMENT_METHOD_CONFIG: Record<
  PaymentMethod,
  {
    label: string;
    shortLabel: string;
    badgeVariant: StatusBadgeVariant;
  }
> = {
  COD: {
    label: 'COD (Tiền mặt khi giao)',
    shortLabel: 'COD',
    badgeVariant: 'orange',
  },
  CREDIT_CARD: {
    label: 'Thẻ tín dụng / Ghi nợ (CC)',
    shortLabel: 'Thẻ CC',
    badgeVariant: 'blue',
  },
  MOMO: {
    label: 'Ví MoMo',
    shortLabel: 'MoMo',
    badgeVariant: 'pink',
  },
  BANK_TRANSFER: {
    label: 'Chuyển khoản ngân hàng',
    shortLabel: 'Chuyển khoản',
    badgeVariant: 'teal',
  },
  ZALOPAY: {
    label: 'Ví ZaloPay',
    shortLabel: 'ZaloPay',
    badgeVariant: 'cyan',
  },
  VNPAY: {
    label: 'VNPay QR',
    shortLabel: 'VNPay',
    badgeVariant: 'purple',
  },
};

export const PAYMENT_STATUS_CONFIG: Record<
  PaymentStatus,
  {
    label: string;
    shortLabel: string;
    badgeVariant: StatusBadgeVariant;
  }
> = {
  UNPAID: {
    label: 'Chưa thanh toán',
    shortLabel: 'Chưa TT',
    badgeVariant: 'warning',
  },
  PAID: {
    label: 'Đã thanh toán',
    shortLabel: 'Đã TT',
    badgeVariant: 'success',
  },
  REFUNDED: {
    label: 'Đã hoàn tiền',
    shortLabel: 'Hoàn tiền',
    badgeVariant: 'neutral',
  },
};

export function defaultPaymentStatusForMethod(method: PaymentMethod): PaymentStatus {
  return method === 'COD' ? 'UNPAID' : 'PAID';
}

export function getOrderCodAmount(order: Pick<Order, 'totalAmount' | 'paymentMethod' | 'paymentStatus'>): number {
  const method = order.paymentMethod ?? 'COD';
  const status = order.paymentStatus ?? 'UNPAID';
  if (method === 'COD' && status === 'UNPAID') {
    return Number(order.totalAmount) || 0;
  }
  return 0;
}

export function isOrderPrepaid(order: Pick<Order, 'paymentMethod' | 'paymentStatus'>): boolean {
  const method = order.paymentMethod ?? 'COD';
  const status = order.paymentStatus ?? 'UNPAID';
  return method !== 'COD' && status === 'PAID';
}

export function isOrderUnpaidOnline(order: Pick<Order, 'paymentMethod' | 'paymentStatus'>): boolean {
  const method = order.paymentMethod ?? 'COD';
  const status = order.paymentStatus ?? 'UNPAID';
  return method !== 'COD' && status === 'UNPAID';
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
  code: 'DEP-001',
  name: 'Bến Thành',
  address: '156 Lê Thánh Tôn',
  latitude: 10.769568,
  longitude: 106.696129,
  phone: '02871744091',
  isDefault: true,
  isActive: true,
  notes: '',
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
  { key: 'FAILED', label: 'Thất bại (Failed)' },
] as const;

export interface ProductDepotStock {
  storeId: number;
  storeCode: string;
  storeName: string;
  isDefault: boolean;
  isActive: boolean;
  quantity: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: string | number;
  stock: number;
  totalStock?: number;
  depotStocks?: ProductDepotStock[];
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
  depotStocks: Record<number, string>;
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
  depotStocks: {},
  isActive: true,
};

export function createInitialProductForm(stores: Store[]): ProductFormState {
  const depotStocks: Record<number, string> = {};
  for (const s of stores) {
    depotStocks[s.id] = s.isDefault ? '50' : '0';
  }
  return {
    ...INITIAL_PRODUCT_FORM,
    depotStocks,
  };
}

export function productToFormState(product: Product, stores: Store[] = []): ProductFormState {
  const depotStocks: Record<number, string> = {};
  for (const s of stores) {
    depotStocks[s.id] = '0';
  }
  if (Array.isArray(product.depotStocks) && product.depotStocks.length > 0) {
    for (const ds of product.depotStocks) {
      depotStocks[ds.storeId] = String(ds.quantity);
    }
  } else {
    const defaultStore = stores.find((s) => s.isDefault) ?? stores[0];
    if (defaultStore) {
      depotStocks[defaultStore.id] = String(product.stock ?? 0);
    }
  }
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit: product.unit,
    price: String(Number(product.price)),
    depotStocks,
    isActive: product.isActive,
  };
}

export interface DriverActiveTrip {
  id: number;
  tripCode: string;
  status: string;
  ordersCount: number;
}

export interface DriverStoreSummary {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface Driver {
  id: number;
  email: string;
  name: string;
  role: Role;
  storeId: number | null;
  store: DriverStoreSummary | null;
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
  storeId: string;
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
  storeId: '',
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
    storeId: driver.storeId ? String(driver.storeId) : '',
    vehicleType: driver.vehicleType || 'Xe máy',
    licensePlate: driver.licensePlate,
    status: driver.status,
    isActive: driver.isActive,
    notes: driver.notes || '',
  };
}

export const TRIP_STATUS_CONFIG: Record<
  TripStatus,
  { label: string; shortLabel: string; badgeVariant: StatusBadgeVariant }
> = {
  ASSIGNED: {
    label: 'Chờ xuất phát (ASSIGNED)',
    shortLabel: 'ASSIGNED',
    badgeVariant: 'purple',
  },
  IN_TRANSIT: {
    label: 'Đang giao hàng (IN_TRANSIT)',
    shortLabel: 'IN_TRANSIT',
    badgeVariant: 'blue',
  },
  COMPLETED: {
    label: 'Hoàn thành (COMPLETED)',
    shortLabel: 'COMPLETED',
    badgeVariant: 'green',
  },
};

export const TRIP_STATUS_TABS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'ASSIGNED', label: 'Chờ xuất phát' },
  { key: 'IN_TRANSIT', label: 'Đang giao' },
  { key: 'COMPLETED', label: 'Hoàn thành' },
] as const;

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface ManagedUser extends AuthUser {
  isActive: boolean;
  hasDriverProfile: boolean;
  driverProfile?: {
    id: number;
    phone: string;
    licensePlate: string;
    vehicleType: string;
    status: DriverStatus;
    storeId: number;
  } | null;
  tripsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserSummary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  adminCount: number;
  warehouseCount: number;
  driverCount: number;
}

export interface PaginatedUsersResponse {
  items: ManagedUser[];
  pagination: UserPagination;
  summary: UserSummary;
}

export interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: Role;
  isActive: boolean;
}

export const INITIAL_USER_FORM: UserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'WAREHOUSE',
  isActive: true,
};

export function userToFormState(user: ManagedUser): UserFormState {
  return {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    isActive: user.isActive,
  };
}

export function formatVND(val: string | number): string {
  return Number(val).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
