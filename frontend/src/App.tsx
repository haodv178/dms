import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Truck,
  Package,
  MapPin,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  UserCheck,
  Store as StoreIcon,
  Plus,
  Navigation,
  Clock,
  ShoppingBag,
  Layers,
  CheckSquare,
  Square,
  ArrowRight,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export type Role = 'ADMIN' | 'WAREHOUSE' | 'DRIVER';
export type OrderStatus = 'NEW' | 'PICKING' | 'PACKED' | 'DELIVERING' | 'COMPLETED' | 'FAILED';

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

const DEFAULT_DEPOT: Store = {
  id: 1,
  name: 'Lotte Mart Quận 7 (Depot)',
  address: '469 Nguyễn Hữu Thọ, Tân Hưng, Quận 7, TP.HCM',
  latitude: 10.7423,
  longitude: 106.7024,
};

const ROLE_META: Record<Role, { label: string; email: string; badgeClass: string; desc: string }> = {
  ADMIN: {
    label: 'Quản lý / Điều phối (Admin)',
    email: 'admin@dms.vn',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    desc: 'Chọn các đơn đã đóng gói (PACKED) và bấm tối ưu lộ trình với Google OR-Tools',
  },
  WAREHOUSE: {
    label: 'Nhân viên Kho (Warehouse)',
    email: 'kho@dms.vn',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    desc: 'Tiếp nhận đơn mới (NEW), thực hiện Nhặt hàng (PICKING) và Đóng gói (PACKED)',
  },
  DRIVER: {
    label: 'Tài xế Giao hàng (Driver)',
    email: 'taixe@dms.vn',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    desc: 'Di chuyển theo thứ tự điểm dừng tối ưu (#1, #2, #3...) và xác nhận giao hàng',
  },
};

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; badge: string; dotColor: string }
> = {
  NEW: {
    label: 'Mới tạo (NEW)',
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    dotColor: '#0284c7',
  },
  PICKING: {
    label: 'Đang nhặt (PICKING)',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    dotColor: '#d97706',
  },
  PACKED: {
    label: 'Đã đóng gói (PACKED)',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    dotColor: '#4f46e5',
  },
  DELIVERING: {
    label: 'Đang giao (DELIVERING)',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    dotColor: '#2563eb',
  },
  COMPLETED: {
    label: 'Hoàn thành (COMPLETED)',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotColor: '#059669',
  },
  FAILED: {
    label: 'Giao thất bại (FAILED)',
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    dotColor: '#e11d48',
  },
};

function createDepotIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:40px;height:40px;border-radius:9999px;
      background:#dc2626;color:white;font-weight:800;font-size:18px;
      border:3px solid white;box-shadow:0 4px 12px rgba(220,38,38,0.5);
    " title="Depot">🏪</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function createOrderMarkerIcon(order: Order, isSelected: boolean) {
  const seq = order.deliverySequence;
  const color = STATUS_CONFIG[order.status]?.dotColor || '#475569';
  const ring = isSelected ? '0 0 0 4px rgba(99,102,241,0.45),' : '';

  if (seq !== null && seq !== undefined) {
    return L.divIcon({
      className: 'leaflet-div-icon',
      html: `<div style="
        display:flex;align-items:center;justify-content:center;
        width:34px;height:34px;border-radius:9999px;
        background:${color};color:white;font-weight:800;font-size:14px;
        border:3px solid white;box-shadow:${ring}0 3px 10px rgba(0,0,0,0.35);
      ">${seq}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -17],
    });
  }

  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;
      background:${color};color:white;font-weight:700;font-size:11px;
      border:2.5px solid white;box-shadow:${ring}0 2px 6px rgba(0,0,0,0.28);
    ">•</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

function MapBoundsUpdater({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

export default function App() {
  const [role, setRole] = useState<Role>('ADMIN');
  const [orders, setOrders] = useState<Order[]>([]);
  const [depot, setDepot] = useState<Store>(DEFAULT_DEPOT);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );
  const [showNewOrderModal, setShowNewOrderModal] = useState<boolean>(false);
  const [newOrderForm, setNewOrderForm] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    latitude: '10.7465',
    longitude: '106.7075',
    totalAmount: '350000',
    productName: 'Combo Thực phẩm Tươi sống Lotte Mart',
  });

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [ordersRes, overviewRes, tripRes] = await Promise.all([
        axios.get(`${API_BASE}/orders`),
        axios.get(`${API_BASE}/system/overview`),
        axios.get(`${API_BASE}/trips/my-active`),
      ]);
      const fetchedOrders: Order[] = ordersRes.data.data || [];
      setOrders(fetchedOrders);

      if (overviewRes.data?.data?.stores?.[0]) {
        setDepot(overviewRes.data.data.stores[0]);
      }
      if (tripRes.data?.data) {
        setActiveTrip(tripRes.data.data);
      } else {
        setActiveTrip(null);
      }

      // Giữ lại các selectedOrderIds vẫn còn ở trạng thái PACKED
      const packedSet = new Set(
        fetchedOrders.filter((o) => o.status === 'PACKED').map((o) => o.id)
      );
      setSelectedOrderIds((prev) => prev.filter((id) => packedSet.has(id)));
    } catch (err: any) {
      showNotification(
        `Không thể kết nối Backend: ${err?.response?.data?.message || err.message}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleSeedOrders = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/seed`);
      showNotification(res.data.message || 'Đã nạp 10 đơn hàng mẫu thành công!', 'success');
      setSelectedOrderIds([]);
      setActiveTrip(null);
      await fetchAllData();
    } catch (err: any) {
      showNotification(
        `Lỗi nạp dữ liệu mẫu: ${err?.response?.data?.message || err.message}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartPicking = async (orderId: number) => {
    try {
      await axios.patch(`${API_BASE}/orders/${orderId}/start-picking`);
      showNotification(`Đơn #${orderId}: Đã chuyển sang ĐANG NHẶT HÀNG (PICKING)`);
      await fetchAllData();
    } catch (err: any) {
      showNotification(err?.response?.data?.message || err.message, 'error');
    }
  };

  const handleCompletePacking = async (orderId: number) => {
    try {
      await axios.patch(`${API_BASE}/orders/${orderId}/complete-packing`);
      showNotification(`Đơn #${orderId}: Đã ĐÓNG GÓI XONG (PACKED) — Sẵn sàng điều phối!`);
      setSelectedOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
      await fetchAllData();
    } catch (err: any) {
      showNotification(err?.response?.data?.message || err.message, 'error');
    }
  };

  const handleBatchPreparePacked = async () => {
    try {
      setLoading(true);
      const newOrders = orders.filter((o) => o.status === 'NEW');
      for (const o of newOrders) {
        await axios.patch(`${API_BASE}/orders/${o.id}/start-picking`);
      }
      const pickingOrders = orders.filter((o) => o.status === 'NEW' || o.status === 'PICKING');
      for (const o of pickingOrders) {
        await axios.patch(`${API_BASE}/orders/${o.id}/complete-packing`);
      }
      await fetchAllData();
      const allIds = pickingOrders.map((o) => o.id);
      setSelectedOrderIds(allIds);
      showNotification(
        `Đã nhặt & đóng gói nhanh ${pickingOrders.length} đơn hàng! Sẵn sàng chạy OR-Tools.`,
        'success'
      );
    } catch (err: any) {
      showNotification(err?.response?.data?.message || err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteDelivery = async (orderId: number) => {
    try {
      await axios.patch(`${API_BASE}/orders/${orderId}/complete-delivery`);
      showNotification(`Đơn #${orderId}: Giao hàng THÀNH CÔNG (COMPLETED)!`, 'success');
      await fetchAllData();
    } catch (err: any) {
      showNotification(err?.response?.data?.message || err.message, 'error');
    }
  };

  const handleFailDelivery = async (orderId: number) => {
    try {
      await axios.patch(`${API_BASE}/orders/${orderId}/fail-delivery`);
      showNotification(`Đơn #${orderId}: Đã đánh dấu GIAO THẤT BẠI (FAILED).`, 'info');
      await fetchAllData();
    } catch (err: any) {
      showNotification(err?.response?.data?.message || err.message, 'error');
    }
  };

  const handleOptimizeRoute = async () => {
    const targetIds =
      selectedOrderIds.length > 0
        ? selectedOrderIds
        : orders.filter((o) => o.status === 'PACKED').map((o) => o.id);

    if (targetIds.length === 0) {
      showNotification(
        'Vui lòng chuyển ít nhất 1 đơn hàng sang trạng thái PACKED và tick chọn trước khi tối ưu!',
        'error'
      );
      return;
    }

    setOptimizing(true);
    try {
      const res = await axios.post(`${API_BASE}/trips/optimize`, {
        storeId: depot.id,
        orderIds: targetIds,
      });
      setActiveTrip(res.data.data);
      setSelectedOrderIds([]);
      showNotification(
        `⚡ Google OR-Tools đã tối ưu lộ trình cho ${targetIds.length} điểm giao (${(
          (res.data.data?.totalDistance || 0) / 1000
        ).toFixed(2)} km)!`,
        'success'
      );
      await fetchAllData();
    } catch (err: any) {
      showNotification(
        `Lỗi gọi OR-Tools Solver: ${err?.response?.data?.message || err.message}`,
        'error'
      );
    } finally {
      setOptimizing(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/orders`, {
        storeId: depot.id,
        customerName: newOrderForm.customerName,
        customerPhone: newOrderForm.customerPhone,
        customerAddress: newOrderForm.customerAddress,
        latitude: parseFloat(newOrderForm.latitude),
        longitude: parseFloat(newOrderForm.longitude),
        totalAmount: parseFloat(newOrderForm.totalAmount),
        items: [
          {
            productName: newOrderForm.productName,
            quantity: 1,
            price: parseFloat(newOrderForm.totalAmount),
          },
        ],
      });
      showNotification('Đã tạo đơn hàng mới thành công!', 'success');
      setShowNewOrderModal(false);
      setNewOrderForm({
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        latitude: '10.7465',
        longitude: '106.7075',
        totalAmount: '350000',
        productName: 'Combo Thực phẩm Tươi sống Lotte Mart',
      });
      await fetchAllData();
    } catch (err: any) {
      showNotification(err?.response?.data?.message || err.message, 'error');
    }
  };

  const toggleSelectOrder = (id: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const packedOrders = useMemo(
    () => orders.filter((o) => o.status === 'PACKED'),
    [orders]
  );

  const toggleSelectAllPacked = () => {
    if (selectedOrderIds.length === packedOrders.length && packedOrders.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(packedOrders.map((o) => o.id));
    }
  };

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: orders.length,
      NEW: 0,
      PICKING: 0,
      PACKED: 0,
      DELIVERING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };
    for (const o of orders) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return map;
  }, [orders]);

  // Các điểm dừng của lộ trình tối ưu hiện tại để vẽ Polyline
  const routedOrders = useMemo(() => {
    if (activeTrip?.orders && activeTrip.orders.length > 0) {
      return [...activeTrip.orders].sort(
        (a, b) => (a.deliverySequence || 999) - (b.deliverySequence || 999)
      );
    }
    return orders
      .filter((o) => o.deliverySequence !== null && o.deliverySequence !== undefined)
      .sort((a, b) => (a.deliverySequence || 999) - (b.deliverySequence || 999));
  }, [activeTrip, orders]);

  const polylinePositions = useMemo<[number, number][]>(() => {
    if (routedOrders.length === 0) return [];
    return [
      [depot.latitude, depot.longitude],
      ...routedOrders.map((o): [number, number] => [o.latitude, o.longitude]),
    ];
  }, [depot, routedOrders]);

  const allMapPoints = useMemo<[number, number][]>(() => {
    return [
      [depot.latitude, depot.longitude],
      ...orders.map((o): [number, number] => [o.latitude, o.longitude]),
    ];
  }, [depot, orders]);

  const formatVND = (val: string | number) =>
    Number(val).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 1. TOP BAR */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  DMS Dashboard
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Google OR-Tools VRP
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Hệ thống Quản lý Đơn hàng Kho & Điều phối Giao hàng
              </p>
            </div>
          </div>

          {/* Role Switcher + Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-medium text-slate-600">Vai trò (Switch Role):</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="bg-white text-xs font-semibold text-slate-800 px-2.5 py-1 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="ADMIN">👑 Quản lý / Điều phối (ADMIN)</option>
                <option value="WAREHOUSE">📦 Nhân viên Kho (WAREHOUSE)</option>
                <option value="DRIVER">🛵 Tài xế Giao hàng (DRIVER)</option>
              </select>
            </div>

            <button
              onClick={() => setShowNewOrderModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              Tạo đơn mới
            </button>

            <button
              onClick={handleSeedOrders}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Seed 10 Sample Orders
            </button>
          </div>
        </div>

        {/* Role Contextual Guide Bar */}
        <div className="bg-slate-900 text-slate-100 text-xs py-2 px-4 sm:px-6">
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${ROLE_META[role].badgeClass}`}>
                {role}
              </span>
              <span className="font-medium text-slate-300">
                Tài khoản đang chọn: <strong className="text-white">{ROLE_META[role].email}</strong> —{' '}
                {ROLE_META[role].desc}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-300">
              <span>NEW ({counts.NEW})</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span>PICKING ({counts.PICKING})</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span>PACKED ({counts.PACKED})</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span>DELIVERING ({counts.DELIVERING})</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span className="text-emerald-400 font-semibold">COMPLETED ({counts.COMPLETED})</span>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md animate-bounce">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : toast.type === 'info'
                ? 'bg-slate-800 text-white border-slate-700'
                : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* MAIN CONTENT: 2 COLUMNS (ORDER TABLE + LEAFLET MAP) */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN (7 cols): ORDER MANAGEMENT TABLE */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          {/* Action Banner for OR-Tools & Quick Warehouse Prep */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Bảng Điều Phối & Quản Lý Vòng Đời Đơn Hàng (OMS)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đã chọn <strong className="text-indigo-600">{selectedOrderIds.length}</strong> /{' '}
                <strong>{packedOrders.length}</strong> đơn hàng <code className="font-mono">PACKED</code> sẵn sàng tối ưu lộ trình.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(counts.NEW > 0 || counts.PICKING > 0) && (
                <button
                  onClick={handleBatchPreparePacked}
                  disabled={loading}
                  title="Tự động Nhặt & Đóng gói toàn bộ đơn NEW/PICKING để test nhanh OR-Tools"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5" />
                  Đóng gói nhanh ({counts.NEW + counts.PICKING} đơn)
                </button>
              )}

              <button
                onClick={handleOptimizeRoute}
                disabled={optimizing || packedOrders.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 ${optimizing ? 'animate-spin' : ''}`} />
                {optimizing
                  ? 'Đang giải VRP với OR-Tools...'
                  : `⚡ Tối ưu hóa lộ trình với Google OR-Tools (${
                      selectedOrderIds.length > 0 ? selectedOrderIds.length : packedOrders.length
                    })`}
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="px-4 pt-3 pb-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'ALL', label: 'Tất cả' },
                    { key: 'NEW', label: 'Mới (New)' },
                    { key: 'PICKING', label: 'Đang nhặt (Picking)' },
                    { key: 'PACKED', label: 'Đã đóng gói (Packed)' },
                    { key: 'DELIVERING', label: 'Đang giao (Delivering)' },
                    { key: 'COMPLETED', label: 'Hoàn thành (Completed)' },
                  ] as const
                ).map((tab) => {
                  const active = statusFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {tab.label}{' '}
                      <span
                        className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                          active ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {counts[tab.key] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {packedOrders.length > 0 && (
                <button
                  onClick={toggleSelectAllPacked}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  {selectedOrderIds.length === packedOrders.length ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  Chọn tất cả PACKED ({packedOrders.length})
                </button>
              )}
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
                    <th className="py-3 px-3 w-10 text-center">Chọn</th>
                    <th className="py-3 px-3">Mã Đơn / Thứ Tự</th>
                    <th className="py-3 px-3">Khách Hàng & Địa Chỉ</th>
                    <th className="py-3 px-3">Tổng Tiền</th>
                    <th className="py-3 px-3">Trạng Thái</th>
                    <th className="py-3 px-3 text-right">Thao Tác ({role})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Không có đơn hàng nào trong trạng thái này. Hãy bấm{' '}
                        <strong className="text-slate-600">"Seed 10 Sample Orders"</strong> trên thanh công cụ.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const isPacked = order.status === 'PACKED';
                      const isChecked = selectedOrderIds.includes(order.id);
                      return (
                        <tr
                          key={order.id}
                          className={`hover:bg-slate-50/90 transition ${
                            isChecked ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              disabled={!isPacked}
                              checked={isChecked}
                              onChange={() => toggleSelectOrder(order.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30 cursor-pointer"
                            />
                          </td>

                          {/* Order Code & Stop Sequence */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{order.orderCode}</div>
                            {order.deliverySequence ? (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white">
                                <Navigation className="w-2.5 h-2.5" />
                                Stop #{order.deliverySequence}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">ID: #{order.id}</span>
                            )}
                          </td>

                          {/* Customer & Items */}
                          <td className="py-3 px-3 max-w-xs">
                            <div className="font-semibold text-slate-800">
                              {order.customerName}{' '}
                              <span className="font-normal text-slate-500">({order.customerPhone})</span>
                            </div>
                            <div className="text-slate-500 text-[11px] flex items-start gap-1 mt-0.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span>{order.customerAddress}</span>
                            </div>
                            {order.items && order.items.length > 0 && (
                              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 truncate">
                                <ShoppingBag className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {order.items
                                    .map((i) => `${i.productName} (x${i.quantity})`)
                                    .join(', ')}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Total Amount */}
                          <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-800">
                            {formatVND(order.totalAmount)}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                STATUS_CONFIG[order.status].badge
                              }`}
                            >
                              {STATUS_CONFIG[order.status].label}
                            </span>
                          </td>

                          {/* Action Buttons */}
                          <td className="py-3 px-3 whitespace-nowrap text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {order.status === 'NEW' && (
                                <button
                                  onClick={() => handleStartPicking(order.id)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition cursor-pointer"
                                >
                                  Bắt đầu nhặt hàng
                                </button>
                              )}

                              {order.status === 'PICKING' && (
                                <button
                                  onClick={() => handleCompletePacking(order.id)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition cursor-pointer"
                                >
                                  Đóng gói xong
                                </button>
                              )}

                              {order.status === 'PACKED' && (
                                <button
                                  onClick={() => toggleSelectOrder(order.id)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                    isChecked
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                                  }`}
                                >
                                  {isChecked ? '✓ Đã chọn điều phối' : '+ Chọn vào chuyến'}
                                </button>
                              )}

                              {order.status === 'DELIVERING' && (
                                <>
                                  <button
                                    onClick={() => handleCompleteDelivery(order.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Giao thành công
                                  </button>
                                  <button
                                    onClick={() => handleFailDelivery(order.id)}
                                    title="Giao thất bại"
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {(order.status === 'COMPLETED' || order.status === 'FAILED') && (
                                <span className="text-[11px] text-slate-400 italic">Đã kết thúc</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (5 cols): LEAFLET MAP & OPTIMIZED TRIP ROUTE */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* Map Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Bản Đồ Lộ Trình & Điều Phối (Leaflet OSM)
                </h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span> Kho (Depot)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span> Điểm giao (#1..#N)
                </span>
              </div>
            </div>

            <div className="h-[430px] w-full relative z-0">
              <MapContainer
                center={[depot.latitude, depot.longitude]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapBoundsUpdater points={allMapPoints} />

                {/* Depot Marker */}
                <Marker position={[depot.latitude, depot.longitude]} icon={createDepotIcon()}>
                  <Popup>
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-rose-600 flex items-center gap-1">
                        <StoreIcon className="w-3.5 h-3.5" />
                        {depot.name}
                      </div>
                      <div className="text-slate-600">{depot.address}</div>
                      <div className="text-[11px] text-slate-400">
                        GPS: {depot.latitude.toFixed(4)}, {depot.longitude.toFixed(4)}
                      </div>
                    </div>
                  </Popup>
                </Marker>

                {/* Order Markers */}
                {orders.map((order) => (
                  <Marker
                    key={order.id}
                    position={[order.latitude, order.longitude]}
                    icon={createOrderMarkerIcon(order, selectedOrderIds.includes(order.id))}
                  >
                    <Popup>
                      <div className="text-xs space-y-1.5 min-w-[200px]">
                        <div className="flex items-center justify-between gap-2 border-b pb-1">
                          <span className="font-bold text-slate-900">{order.orderCode}</span>
                          {order.deliverySequence && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[10px]">
                              Điểm dừng #{order.deliverySequence}
                            </span>
                          )}
                        </div>
                        <div>
                          <strong>Khách hàng:</strong> {order.customerName}
                        </div>
                        <div>
                          <strong>SĐT:</strong> {order.customerPhone}
                        </div>
                        <div>
                          <strong>Địa chỉ:</strong> {order.customerAddress}
                        </div>
                        <div>
                          <strong>Thu hộ (COD):</strong>{' '}
                          <span className="font-bold text-emerald-700">
                            {formatVND(order.totalAmount)}
                          </span>
                        </div>
                        <div>
                          <strong>Trạng thái:</strong> {STATUS_CONFIG[order.status].label}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Polyline Route Connecting Depot -> Stop #1 -> Stop #2 -> ... */}
                {polylinePositions.length > 1 && (
                  <Polyline
                    positions={polylinePositions}
                    pathOptions={{
                      color: '#4f46e5',
                      weight: 4,
                      opacity: 0.85,
                      dashArray: '8, 6',
                    }}
                  />
                )}
              </MapContainer>
            </div>
          </div>

          {/* Active Trip & Route Sequence Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-indigo-600" />
                  Lộ Trình Chuyến Xe Tối Ưu (OR-Tools VRP Output)
                </h3>
                <p className="text-xs text-slate-500">
                  {activeTrip
                    ? `Mã chuyến: ${activeTrip.tripCode} • Tài xế: ${
                        activeTrip.driver?.name || 'Tài xế Nguyễn Văn A'
                      }`
                    : 'Chưa có chuyến xe nào được khởi tạo'}
                </p>
              </div>
              {activeTrip && (
                <div className="text-right">
                  <div className="text-xs font-bold text-indigo-600">
                    Tổng quãng đường:{' '}
                    {activeTrip.totalDistance
                      ? `${(activeTrip.totalDistance / 1000).toFixed(2)} km (${activeTrip.totalDistance} m)`
                      : 'N/A'}
                  </div>
                  <span
                    className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                      activeTrip.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {activeTrip.status}
                  </span>
                </div>
              )}
            </div>

            {routedOrders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Clock className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  Chưa có lộ trình tối ưu nào trên bản đồ
                </p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                  Hãy chuyển các đơn hàng sang trạng thái <strong>PACKED</strong>, tick chọn và bấm nút{' '}
                  <strong className="text-indigo-600">"⚡ Tối ưu hóa lộ trình với Google OR-Tools"</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {/* Start Depot */}
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs">
                  <div className="w-7 h-7 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center shrink-0">
                    0
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-rose-900">Điểm xuất phát: {depot.name}</div>
                    <div className="text-[11px] text-rose-700 truncate">{depot.address}</div>
                  </div>
                </div>

                {/* Ordered Stops */}
                {routedOrders.map((stopOrder) => (
                  <div
                    key={stopOrder.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full text-white font-bold flex items-center justify-center shrink-0 ${
                          stopOrder.status === 'COMPLETED'
                            ? 'bg-emerald-600'
                            : stopOrder.status === 'FAILED'
                            ? 'bg-rose-600'
                            : 'bg-indigo-600'
                        }`}
                      >
                        {stopOrder.deliverySequence}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{stopOrder.orderCode}</span>
                          <span className="text-slate-400">•</span>
                          <span className="truncate">{stopOrder.customerName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {stopOrder.customerAddress}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          STATUS_CONFIG[stopOrder.status].badge
                        }`}
                      >
                        {stopOrder.status}
                      </span>
                      {stopOrder.status === 'DELIVERING' && (
                        <button
                          onClick={() => handleCompleteDelivery(stopOrder.id)}
                          className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Giao xong
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* MODAL TẠO ĐƠN HÀNG MỚI */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">Tạo Đơn Hàng Mới (OMS)</h3>
              <button
                onClick={() => setShowNewOrderModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên khách hàng *</label>
                <input
                  type="text"
                  required
                  value={newOrderForm.customerName}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, customerName: e.target.value })}
                  placeholder="VD: Nguyễn Thị Hương"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  value={newOrderForm.customerPhone}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, customerPhone: e.target.value })}
                  placeholder="VD: 0908123456"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa chỉ giao hàng *</label>
                <input
                  type="text"
                  required
                  value={newOrderForm.customerAddress}
                  onChange={(e) =>
                    setNewOrderForm({ ...newOrderForm, customerAddress: e.target.value })
                  }
                  placeholder="VD: 150 Nguyễn Lương Bằng, Quận 7, TP.HCM"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vĩ độ (Latitude) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newOrderForm.latitude}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kinh độ (Longitude) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newOrderForm.longitude}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sản phẩm chính</label>
                  <input
                    type="text"
                    value={newOrderForm.productName}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, productName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tổng tiền (VNĐ)</label>
                  <input
                    type="number"
                    value={newOrderForm.totalAmount}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, totalAmount: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm cursor-pointer"
                >
                  Tạo đơn hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
