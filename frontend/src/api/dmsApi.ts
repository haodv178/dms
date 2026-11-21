import axios from 'axios';
import {
  computeOrderFormTotal,
  type Order,
  type OrderFormState,
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
  depot: Store | null;
  activeTrip: Trip | null;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [ordersRes, overviewRes, tripRes] = await Promise.all([
    axios.get(`${API_BASE}/orders`),
    axios.get(`${API_BASE}/system/overview`),
    axios.get(`${API_BASE}/trips/my-active`),
  ]);

  return {
    orders: (ordersRes.data?.data as Order[]) || [],
    depot: (overviewRes.data?.data?.stores?.[0] as Store | undefined) ?? null,
    activeTrip: (tripRes.data?.data as Trip | undefined) ?? null,
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

export async function optimizeTripRoute(storeId: number, orderIds: number[]): Promise<Trip> {
  const res = await axios.post(`${API_BASE}/trips/optimize`, {
    storeId,
    orderIds,
  });
  return res.data.data as Trip;
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
