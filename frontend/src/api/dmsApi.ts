import axios from 'axios';
import type { NewOrderFormState, Order, Store, Trip } from '../types/dms';

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

export async function createOrder(storeId: number, form: NewOrderFormState): Promise<void> {
  const amount = parseFloat(form.totalAmount);
  await axios.post(`${API_BASE}/orders`, {
    storeId,
    customerName: form.customerName,
    customerPhone: form.customerPhone,
    customerAddress: form.customerAddress,
    latitude: parseFloat(form.latitude),
    longitude: parseFloat(form.longitude),
    totalAmount: amount,
    items: [
      {
        productName: form.productName,
        quantity: 1,
        price: amount,
      },
    ],
  });
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
