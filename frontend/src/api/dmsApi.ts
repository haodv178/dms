import axios from 'axios';
import { httpClient } from './httpClient';
import {
  computeOrderFormTotal,
  type AuthUser,
  type BulkOrderActionResult,
  type BulkOrderActionType,
  type Driver,
  type DriverFormState,
  type DriverPagination,
  type DriverSummary,
  type ManagedUser,
  type Order,
  type OrderFormState,
  type PaymentStatus,
  type PaginatedDriversResponse,
  type PaginatedProductsResponse,
  type PaginatedStoreInventoryResponse,
  type PaginatedStoresResponse,
  type PaginatedUsersResponse,
  type Product,
  type ProductFormState,
  type ProductPagination,
  type ProductSummary,
  type Store,
  type StoreFormState,
  type StoreInventoryItem,
  type StorePagination,
  type StoreSummary,
  type Trip,
  type UserFormState,
  type UserPagination,
  type UserSummary,
} from '../types/dms';

export interface AuthSessionResponse {
  accessToken: string;
  user: AuthUser;
  message?: string;
}

export async function loginApi(email: string, password: string): Promise<AuthSessionResponse> {
  const res = await httpClient.post('/auth/login', { email, password });
  return {
    accessToken: res.data.accessToken as string,
    user: res.data.user as AuthUser,
    message: res.data.message as string | undefined,
  };
}

export async function refreshSessionApi(): Promise<AuthSessionResponse> {
  const res = await httpClient.post('/auth/refresh');
  return {
    accessToken: res.data.accessToken as string,
    user: res.data.user as AuthUser,
  };
}

export async function logoutApi(): Promise<void> {
  await httpClient.post('/auth/logout');
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string; accessToken?: string; user?: AuthUser }> {
  const res = await httpClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return {
    message: (res.data?.message as string) || 'Đổi mật khẩu thành công!',
    accessToken: res.data?.accessToken as string | undefined,
    user: res.data?.user as AuthUser | undefined,
  };
}

export interface FetchUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export async function fetchUsers(
  params: FetchUsersParams = {}
): Promise<PaginatedUsersResponse> {
  const query: Record<string, string | number> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.search && params.search.trim()) query.search = params.search.trim();
  if (params.role && params.role !== 'ALL') query.role = params.role;
  if (params.status && params.status !== 'ALL') query.status = params.status;

  const res = await httpClient.get('/users', { params: query });
  const items = (res.data?.data as ManagedUser[]) || [];
  const pagination: UserPagination = res.data?.pagination ?? {
    page: params.page ?? 1,
    limit: params.limit ?? items.length,
    total: items.length,
    totalPages: 1,
  };
  const summary: UserSummary = res.data?.summary ?? {
    totalUsers: items.length,
    activeUsers: items.filter((u) => u.isActive).length,
    inactiveUsers: items.filter((u) => !u.isActive).length,
    adminCount: items.filter((u) => u.role === 'ADMIN').length,
    warehouseCount: items.filter((u) => u.role === 'WAREHOUSE').length,
    driverCount: items.filter((u) => u.role === 'DRIVER').length,
  };

  return { items, pagination, summary };
}

export async function createUser(form: UserFormState): Promise<ManagedUser> {
  const res = await httpClient.post('/users', {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    password: form.password,
    role: form.role,
    isActive: form.isActive,
  });
  return res.data.data as ManagedUser;
}

export async function updateUser(
  userId: number,
  form: Pick<UserFormState, 'name' | 'email' | 'role' | 'isActive'>
): Promise<ManagedUser> {
  const res = await httpClient.put(`/users/${userId}`, {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    role: form.role,
    isActive: form.isActive,
  });
  return res.data.data as ManagedUser;
}

export async function resetUserPassword(
  userId: number,
  newPassword: string
): Promise<{ message: string }> {
  const res = await httpClient.patch(`/users/${userId}/reset-password`, {
    newPassword,
  });
  return {
    message: (res.data?.message as string) || 'Đã đặt lại mật khẩu thành công!',
  };
}

export async function deleteUser(userId: number): Promise<void> {
  await httpClient.delete(`/users/${userId}`);
}

export interface DashboardData {
  orders: Order[];
  trips: Trip[];
  depot: Store | null;
  stores: Store[];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [ordersRes, overviewRes, tripsRes] = await Promise.all([
    httpClient.get('/orders'),
    httpClient.get('/system/overview'),
    httpClient.get('/trips'),
  ]);

  const stores = (overviewRes.data?.data?.stores as Store[]) || [];
  const defaultStore = stores.find((s) => s.isDefault) ?? stores[0] ?? null;

  return {
    orders: (ordersRes.data?.data as Order[]) || [],
    trips: (tripsRes.data?.data as Trip[]) || [],
    depot: defaultStore,
    stores,
  };
}

export async function startPickingOrder(orderId: number): Promise<void> {
  await httpClient.patch(`/orders/${orderId}/start-picking`);
}

export async function completePackingOrder(orderId: number): Promise<void> {
  await httpClient.patch(`/orders/${orderId}/complete-packing`);
}

export async function completeDeliveryOrder(orderId: number): Promise<void> {
  await httpClient.patch(`/orders/${orderId}/complete-delivery`);
}

export async function failDeliveryOrder(orderId: number): Promise<void> {
  await httpClient.patch(`/orders/${orderId}/fail-delivery`);
}

export async function assignDriverToOrder(
  orderId: number,
  driverId: number | null
): Promise<{ order: Order; message: string }> {
  const res = await httpClient.patch(`/orders/${orderId}/assign-driver`, {
    driverId,
  });
  return {
    order: res.data.data as Order,
    message: (res.data?.message as string) || 'Cập nhật tài xế cho đơn hàng thành công!',
  };
}

export async function bulkOrderAction(
  action: BulkOrderActionType,
  orderIds: number[],
  driverId?: number
): Promise<BulkOrderActionResult> {
  const res = await httpClient.post('/orders/bulk-action', {
    action,
    orderIds,
    ...(driverId !== undefined ? { driverId } : {}),
  });
  return {
    updatedCount: Number(res.data?.data?.updatedCount ?? 0),
    updatedOrders: (res.data?.data?.updatedOrders as Order[]) || [],
    skipped: (res.data?.data?.skipped as BulkOrderActionResult['skipped']) || [],
    message: (res.data?.message as string) || 'Thực hiện thao tác hàng loạt thành công!',
  };
}

export async function optimizeTripRoute(
  storeId: number,
  orderIds: number[],
  driverId?: number | null
): Promise<Trip> {
  const res = await httpClient.post('/trips/optimize', {
    storeId,
    orderIds,
    ...(driverId ? { driverId } : {}),
  });
  return res.data.data as Trip;
}

export async function startTrip(tripId: number): Promise<{ trip: Trip; message: string }> {
  const res = await httpClient.patch(`/trips/${tripId}/start`);
  return {
    trip: res.data.data as Trip,
    message: (res.data?.message as string) || 'Đã bắt đầu chuyến xe!',
  };
}

export async function reassignTripDriver(
  tripId: number,
  driverId: number
): Promise<{ trip: Trip; message: string }> {
  const res = await httpClient.patch(`/trips/${tripId}/driver`, { driverId });
  return {
    trip: res.data.data as Trip,
    message: (res.data?.message as string) || 'Đã đổi tài xế cho chuyến xe!',
  };
}

export async function reoptimizeTrip(
  tripId: number
): Promise<{ trip: Trip; message: string }> {
  const res = await httpClient.post(`/trips/${tripId}/reoptimize`);
  return {
    trip: res.data.data as Trip,
    message: (res.data?.message as string) || 'Đã tối ưu lại lộ trình chuyến xe!',
  };
}

export async function cancelOrDeleteTrip(
  tripId: number
): Promise<{ deleted: boolean; returnedOrdersCount: number; message: string }> {
  const res = await httpClient.delete(`/trips/${tripId}`);
  return {
    deleted: Boolean(res.data?.data?.deleted),
    returnedOrdersCount: Number(res.data?.data?.returnedOrdersCount ?? 0),
    message: (res.data?.message as string) || 'Đã hủy chuyến xe!',
  };
}

function serializeOrderPayload(form: OrderFormState, fallbackStoreId?: number) {
  const items = form.items.map((item) => ({
    productId: item.productId ?? undefined,
    sku: item.sku && item.sku !== '—' ? item.sku.trim() : undefined,
    productName: item.productName.trim(),
    quantity: Number(item.quantity),
    price: Number(item.price),
  }));
  const parsedStoreId = Number(form.storeId);
  const storeId =
    Number.isInteger(parsedStoreId) && parsedStoreId > 0 ? parsedStoreId : fallbackStoreId;
  return {
    ...(storeId ? { storeId } : {}),
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim(),
    customerAddress: form.customerAddress.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    totalAmount: computeOrderFormTotal(form.items),
    paymentMethod: form.paymentMethod,
    paymentStatus: form.paymentStatus,
    paymentReference: form.paymentReference.trim() || null,
    items,
  };
}

export async function createOrder(storeId: number, form: OrderFormState): Promise<Order> {
  const res = await httpClient.post('/orders', serializeOrderPayload(form, storeId));
  return res.data.data as Order;
}

export async function updateOrder(orderId: number, form: OrderFormState): Promise<Order> {
  const res = await httpClient.put(`/orders/${orderId}`, serializeOrderPayload(form));
  return res.data.data as Order;
}

export async function updateOrderPaymentStatus(
  orderId: number,
  paymentStatus: PaymentStatus,
  paymentReference?: string | null
): Promise<{ order: Order; message: string }> {
  const res = await httpClient.patch(`/orders/${orderId}/payment-status`, {
    paymentStatus,
    ...(paymentReference !== undefined ? { paymentReference } : {}),
  });
  return {
    order: res.data.data as Order,
    message: (res.data?.message as string) || 'Đã cập nhật trạng thái thanh toán!',
  };
}

export interface FetchProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  activeOnly?: boolean;
  storeId?: number | 'ALL';
}

export async function fetchProducts(
  params: FetchProductsParams = {}
): Promise<PaginatedProductsResponse> {
  const query: Record<string, string | number | boolean> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.search && params.search.trim()) query.search = params.search.trim();
  if (params.category && params.category !== 'ALL') query.category = params.category;
  if (params.activeOnly) query.activeOnly = true;
  if (params.storeId !== undefined && params.storeId !== 'ALL') {
    query.storeId = params.storeId;
  }

  const res = await httpClient.get('/products', { params: query });
  const items = (res.data?.data as Product[]) || [];
  const pagination: ProductPagination = res.data?.pagination ?? {
    page: params.page ?? 1,
    limit: params.limit ?? items.length,
    total: items.length,
    totalPages: 1,
  };
  const summary: ProductSummary = res.data?.summary ?? {
    totalProducts: items.length,
    activeProducts: items.filter((p) => p.isActive).length,
    lowStockProducts: items.filter((p) => p.stock <= 10).length,
    totalStock: items.reduce((sum, p) => sum + p.stock, 0),
  };

  return { items, pagination, summary };
}

function serializeProductPayload(form: ProductFormState) {
  const depotStocks = Object.entries(form.depotStocks).map(([storeId, qty]) => ({
    storeId: Number(storeId),
    quantity: qty.trim() === '' ? 0 : Number(qty),
  }));
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    unit: form.unit.trim() || 'Cái',
    price: Number(form.price),
    depotStocks,
    isActive: form.isActive,
  };
}

export async function createProduct(form: ProductFormState): Promise<Product> {
  const res = await httpClient.post('/products', serializeProductPayload(form));
  return res.data.data as Product;
}

export async function updateProduct(
  productId: number,
  form: ProductFormState
): Promise<Product> {
  const res = await httpClient.put(`/products/${productId}`, serializeProductPayload(form));
  return res.data.data as Product;
}

export async function deleteProduct(productId: number): Promise<void> {
  await httpClient.delete(`/products/${productId}`);
}

export interface FetchDriversParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  vehicleType?: string;
  storeId?: number | 'ALL';
  activeOnly?: boolean;
  availableOnly?: boolean;
}

export async function fetchDrivers(
  params: FetchDriversParams = {}
): Promise<PaginatedDriversResponse> {
  const query: Record<string, string | number | boolean> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.search && params.search.trim()) query.search = params.search.trim();
  if (params.status && params.status !== 'ALL') query.status = params.status;
  if (params.vehicleType && params.vehicleType !== 'ALL') {
    query.vehicleType = params.vehicleType;
  }
  if (params.storeId !== undefined && params.storeId !== 'ALL') {
    query.storeId = params.storeId;
  }
  if (params.activeOnly) query.activeOnly = true;
  if (params.availableOnly) query.availableOnly = true;

  const res = await httpClient.get('/drivers', { params: query });
  const items = (res.data?.data as Driver[]) || [];
  const pagination: DriverPagination = res.data?.pagination ?? {
    page: params.page ?? 1,
    limit: params.limit ?? items.length,
    total: items.length,
    totalPages: 1,
  };
  const summary: DriverSummary = res.data?.summary ?? {
    totalDrivers: items.length,
    availableDrivers: items.filter((d) => d.isActive && d.status === 'AVAILABLE').length,
    onDeliveryDrivers: items.filter((d) => d.status === 'ON_DELIVERY').length,
    inactiveDrivers: items.filter((d) => !d.isActive).length,
  };

  return { items, pagination, summary };
}

function serializeDriverPayload(form: DriverFormState) {
  return {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    ...(form.password.trim() ? { password: form.password.trim() } : {}),
    phone: form.phone.trim(),
    storeId: Number(form.storeId),
    vehicleType: form.vehicleType.trim() || 'Xe máy',
    licensePlate: form.licensePlate.trim().toUpperCase(),
    status: form.status,
    isActive: form.isActive,
    notes: form.notes.trim(),
  };
}

export async function createDriver(form: DriverFormState): Promise<Driver> {
  const res = await httpClient.post('/drivers', serializeDriverPayload(form));
  return res.data.data as Driver;
}

export async function updateDriver(driverId: number, form: DriverFormState): Promise<Driver> {
  const res = await httpClient.put(`/drivers/${driverId}`, serializeDriverPayload(form));
  return res.data.data as Driver;
}

export async function deleteDriver(driverId: number): Promise<void> {
  await httpClient.delete(`/drivers/${driverId}`);
}

export interface FetchStoresParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  activeOnly?: boolean;
}

export async function fetchStores(
  params: FetchStoresParams = {}
): Promise<PaginatedStoresResponse> {
  const query: Record<string, string | number | boolean> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.search && params.search.trim()) query.search = params.search.trim();
  if (params.status && params.status !== 'ALL') query.status = params.status;
  if (params.activeOnly) query.activeOnly = true;

  const res = await httpClient.get('/stores', { params: query });
  const items = (res.data?.data as Store[]) || [];
  const pagination: StorePagination = res.data?.pagination ?? {
    page: params.page ?? 1,
    limit: params.limit ?? items.length,
    total: items.length,
    totalPages: 1,
  };
  const defaultStore = items.find((s) => s.isDefault) ?? items[0];
  const summary: StoreSummary = res.data?.summary ?? {
    totalStores: items.length,
    activeStores: items.filter((s) => s.isActive !== false).length,
    inactiveStores: items.filter((s) => s.isActive === false).length,
    defaultStoreId: defaultStore?.id ?? null,
    defaultStoreName: defaultStore?.name ?? 'Chưa thiết lập',
    totalOrders: items.reduce((sum, s) => sum + (s.ordersCount ?? 0), 0),
    totalTrips: items.reduce((sum, s) => sum + (s.tripsCount ?? 0), 0),
  };

  return { items, pagination, summary };
}

function serializeStorePayload(form: StoreFormState) {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    address: form.address.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    phone: form.phone.trim(),
    isDefault: form.isDefault,
    isActive: form.isDefault ? true : form.isActive,
    notes: form.notes.trim(),
  };
}

export async function createStore(form: StoreFormState): Promise<Store> {
  const res = await httpClient.post('/stores', serializeStorePayload(form));
  return res.data.data as Store;
}

export async function updateStore(storeId: number, form: StoreFormState): Promise<Store> {
  const res = await httpClient.put(`/stores/${storeId}`, serializeStorePayload(form));
  return res.data.data as Store;
}

export async function setDefaultStore(storeId: number): Promise<{ store: Store; message: string }> {
  const res = await httpClient.patch(`/stores/${storeId}/set-default`);
  return {
    store: res.data.data as Store,
    message: (res.data?.message as string) || 'Đã đặt điểm xuất phát mặc định!',
  };
}

export async function deleteStore(storeId: number): Promise<void> {
  await httpClient.delete(`/stores/${storeId}`);
}

export interface FetchStoreInventoryParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  stockFilter?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export async function fetchStoreInventory(
  storeId: number,
  params: FetchStoreInventoryParams = {}
): Promise<PaginatedStoreInventoryResponse> {
  const query: Record<string, string | number> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.search && params.search.trim()) query.search = params.search.trim();
  if (params.category && params.category !== 'ALL') query.category = params.category;
  if (params.stockFilter && params.stockFilter !== 'ALL') {
    query.stockFilter = params.stockFilter;
  }

  const res = await httpClient.get(`/stores/${storeId}/inventory`, { params: query });
  return {
    store: res.data.store,
    items: (res.data?.data as StoreInventoryItem[]) || [],
    pagination: res.data.pagination,
    summary: res.data.summary,
  };
}

export async function updateStoreInventory(
  storeId: number,
  items: Array<{ productId: number; quantity: number }>
): Promise<{ message: string; updatedCount: number }> {
  const res = await httpClient.put(`/stores/${storeId}/inventory`, { items });
  return {
    message: (res.data?.message as string) || 'Đã cập nhật tồn kho depot thành công!',
    updatedCount: res.data?.data?.updatedCount ?? items.length,
  };
}

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message || err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Đã có lỗi xảy ra';
}
