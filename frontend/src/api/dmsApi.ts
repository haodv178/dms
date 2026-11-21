import axios from 'axios';
import {
  computeOrderFormTotal,
  type BulkOrderActionResult,
  type BulkOrderActionType,
  type Driver,
  type DriverFormState,
  type DriverPagination,
  type DriverSummary,
  type Order,
  type OrderFormState,
  type PaginatedDriversResponse,
  type PaginatedProductsResponse,
  type Product,
  type ProductFormState,
  type ProductPagination,
  type ProductSummary,
  type Store,
  type Trip,
} from '../types/dms';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export interface DashboardData {
  orders: Order[];
  trips: Trip[];
  depot: Store | null;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [ordersRes, overviewRes, tripsRes] = await Promise.all([
    axios.get(`${API_BASE}/orders`),
    axios.get(`${API_BASE}/system/overview`),
    axios.get(`${API_BASE}/trips`),
  ]);

  return {
    orders: (ordersRes.data?.data as Order[]) || [],
    trips: (tripsRes.data?.data as Trip[]) || [],
    depot: (overviewRes.data?.data?.stores?.[0] as Store | undefined) ?? null,
  };
}

export async function seedSampleOrders(): Promise<string> {
  const res = await axios.post(`${API_BASE}/seed`);
  return res.data?.message || 'Đã nạp 10 đơn hàng mẫu thành công!';
}

export async function startPickingOrder(orderId: number): Promise<void> {
  await axios.patch(`${API_BASE}/orders/${orderId}/start-picking`);
}

export async function completePackingOrder(orderId: number): Promise<void> {
  await axios.patch(`${API_BASE}/orders/${orderId}/complete-packing`);
}

export async function completeDeliveryOrder(orderId: number): Promise<void> {
  await axios.patch(`${API_BASE}/orders/${orderId}/complete-delivery`);
}

export async function failDeliveryOrder(orderId: number): Promise<void> {
  await axios.patch(`${API_BASE}/orders/${orderId}/fail-delivery`);
}

export async function assignDriverToOrder(
  orderId: number,
  driverId: number | null
): Promise<{ order: Order; message: string }> {
  const res = await axios.patch(`${API_BASE}/orders/${orderId}/assign-driver`, {
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
  const res = await axios.post(`${API_BASE}/orders/bulk-action`, {
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
  const res = await axios.post(`${API_BASE}/trips/optimize`, {
    storeId,
    orderIds,
    ...(driverId ? { driverId } : {}),
  });
  return res.data.data as Trip;
}

export async function startTrip(tripId: number): Promise<{ trip: Trip; message: string }> {
  const res = await axios.patch(`${API_BASE}/trips/${tripId}/start`);
  return {
    trip: res.data.data as Trip,
    message: (res.data?.message as string) || 'Đã bắt đầu chuyến xe!',
  };
}

export async function reassignTripDriver(
  tripId: number,
  driverId: number
): Promise<{ trip: Trip; message: string }> {
  const res = await axios.patch(`${API_BASE}/trips/${tripId}/driver`, { driverId });
  return {
    trip: res.data.data as Trip,
    message: (res.data?.message as string) || 'Đã đổi tài xế cho chuyến xe!',
  };
}

export async function reoptimizeTrip(
  tripId: number
): Promise<{ trip: Trip; message: string }> {
  const res = await axios.post(`${API_BASE}/trips/${tripId}/reoptimize`);
  return {
    trip: res.data.data as Trip,
    message: (res.data?.message as string) || 'Đã tối ưu lại lộ trình chuyến xe!',
  };
}

export async function cancelOrDeleteTrip(
  tripId: number
): Promise<{ deleted: boolean; returnedOrdersCount: number; message: string }> {
  const res = await axios.delete(`${API_BASE}/trips/${tripId}`);
  return {
    deleted: Boolean(res.data?.data?.deleted),
    returnedOrdersCount: Number(res.data?.data?.returnedOrdersCount ?? 0),
    message: (res.data?.message as string) || 'Đã hủy chuyến xe!',
  };
}

function serializeOrderPayload(form: OrderFormState) {
  const items = form.items.map((item) => ({
    productId: item.productId ?? undefined,
    sku: item.sku && item.sku !== '—' ? item.sku.trim() : undefined,
    productName: item.productName.trim(),
    quantity: Number(item.quantity),
    price: Number(item.price),
  }));
  return {
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim(),
    customerAddress: form.customerAddress.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    totalAmount: computeOrderFormTotal(form.items),
    items,
  };
}

export async function createOrder(storeId: number, form: OrderFormState): Promise<Order> {
  const res = await axios.post(`${API_BASE}/orders`, {
    storeId,
    ...serializeOrderPayload(form),
  });
  return res.data.data as Order;
}

export async function updateOrder(orderId: number, form: OrderFormState): Promise<Order> {
  const res = await axios.put(`${API_BASE}/orders/${orderId}`, serializeOrderPayload(form));
  return res.data.data as Order;
}

export interface FetchProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  activeOnly?: boolean;
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

  const res = await axios.get(`${API_BASE}/products`, { params: query });
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
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    unit: form.unit.trim() || 'Cái',
    price: Number(form.price),
    stock: Number(form.stock),
    isActive: form.isActive,
  };
}

export async function createProduct(form: ProductFormState): Promise<Product> {
  const res = await axios.post(`${API_BASE}/products`, serializeProductPayload(form));
  return res.data.data as Product;
}

export async function updateProduct(
  productId: number,
  form: ProductFormState
): Promise<Product> {
  const res = await axios.put(
    `${API_BASE}/products/${productId}`,
    serializeProductPayload(form)
  );
  return res.data.data as Product;
}

export async function deleteProduct(productId: number): Promise<void> {
  await axios.delete(`${API_BASE}/products/${productId}`);
}

export interface FetchDriversParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  vehicleType?: string;
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
  if (params.activeOnly) query.activeOnly = true;
  if (params.availableOnly) query.availableOnly = true;

  const res = await axios.get(`${API_BASE}/drivers`, { params: query });
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
    vehicleType: form.vehicleType.trim() || 'Xe máy',
    licensePlate: form.licensePlate.trim().toUpperCase(),
    status: form.status,
    isActive: form.isActive,
    notes: form.notes.trim(),
  };
}

export async function createDriver(form: DriverFormState): Promise<Driver> {
  const res = await axios.post(`${API_BASE}/drivers`, serializeDriverPayload(form));
  return res.data.data as Driver;
}

export async function updateDriver(driverId: number, form: DriverFormState): Promise<Driver> {
  const res = await axios.put(
    `${API_BASE}/drivers/${driverId}`,
    serializeDriverPayload(form)
  );
  return res.data.data as Driver;
}

export async function deleteDriver(driverId: number): Promise<void> {
  await axios.delete(`${API_BASE}/drivers/${driverId}`);
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
